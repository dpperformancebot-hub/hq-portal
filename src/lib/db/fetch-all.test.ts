import { describe, expect, it, vi } from "vitest";
import { fetchAllRows } from "./fetch-all";

/** A fake table of n rows that honours .range() the way PostgREST does. */
const table = (n: number) => {
  const rows = Array.from({ length: n }, (_, i) => ({ id: `r${i}` }));
  return {
    rows,
    fetcher: vi.fn(async (from: number, to: number) => ({
      data: rows.slice(from, to + 1),
      error: null,
    })),
  };
};

describe("fetchAllRows (R19-1: the 1000-row cap that erased coach assignments)", () => {
  it("returns every row when the table is larger than one page", async () => {
    const t = table(1054); // DP's actual client count when this bug was found
    const got = await fetchAllRows(t.fetcher);
    expect(got).toHaveLength(1054);
    expect(got[1053].id).toBe("r1053");
    // The old code took page one and stopped, losing exactly these.
    expect(got.slice(1000).map((r) => r.id)).toEqual(
      Array.from({ length: 54 }, (_, i) => `r${1000 + i}`),
    );
  });

  it("does not drop the row immediately past the cap", async () => {
    const got = await fetchAllRows(table(1001).fetcher);
    expect(got).toHaveLength(1001);
    expect(got.some((r) => r.id === "r1000")).toBe(true);
  });

  it("handles a table that is an exact multiple of the page size", async () => {
    const t = table(2000);
    const got = await fetchAllRows(t.fetcher);
    expect(got).toHaveLength(2000);
    expect(t.fetcher).toHaveBeenCalledTimes(3); // two full pages, then an empty one
  });

  it("is a single request for a small table", async () => {
    const t = table(12);
    expect(await fetchAllRows(t.fetcher)).toHaveLength(12);
    expect(t.fetcher).toHaveBeenCalledTimes(1);
  });

  it("returns an empty list for an empty table without looping", async () => {
    const t = table(0);
    expect(await fetchAllRows(t.fetcher)).toEqual([]);
    expect(t.fetcher).toHaveBeenCalledTimes(1);
  });

  it("THROWS on a query error rather than returning a short list", async () => {
    // The whole point: a partial set that looks complete is what caused this.
    const fetcher = vi.fn(async (from: number) =>
      from === 0
        ? { data: Array.from({ length: 1000 }, (_, i) => ({ id: `r${i}` })), error: null }
        : { data: null, error: { message: "connection reset" } },
    );
    await expect(fetchAllRows(fetcher, { label: "clients" })).rejects.toThrow(/clients: connection reset/);
  });

  it("stops rather than looping forever if pages never shorten", async () => {
    const endless = vi.fn(async () => ({ data: Array.from({ length: 1000 }, () => ({ id: "x" })), error: null }));
    await expect(fetchAllRows(endless, { maxPages: 3, label: "leads" })).rejects.toThrow(/stopped after 3 pages/);
    expect(endless).toHaveBeenCalledTimes(3);
  });

  it("asks for the right ranges", async () => {
    const t = table(2500);
    await fetchAllRows(t.fetcher);
    expect(t.fetcher.mock.calls.slice(0, 3)).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("honours a custom page size", async () => {
    const t = table(250);
    expect(await fetchAllRows(t.fetcher, { pageSize: 100 })).toHaveLength(250);
    expect(t.fetcher).toHaveBeenCalledTimes(3);
  });
});

describe("the ordering contract", () => {
  // Not a test of fetchAllRows' code so much as a guard on WHY every call site
  // must order. Simulates a row moving past the page boundary between the two
  // reads, which is what an unordered heap scan does when a row is updated
  // mid-page. The helper cannot detect this, which is the point: the order has
  // to be in the query.
  it("silently loses a row when the source reorders between pages", async () => {
    const first = Array.from({ length: 1000 }, (_, i) => ({ id: `r${i}` }));
    // r0 moved to the end of the heap after page 1 was read, so page 2 starts
    // at offset 1000 of a set whose first 1000 no longer contains it.
    const second = [{ id: "r1000" }];
    let call = 0;
    const rows = await fetchAllRows<{ id: string }>(() => {
      call += 1;
      return Promise.resolve({ data: call === 1 ? first : second, error: null });
    });
    expect(rows).toHaveLength(1001);
    expect(rows.some((r) => r.id === "r1000")).toBe(true);
    // The moved row is simply absent, with no error anywhere. Only .order()
    // on the caller's query prevents this.
    expect(rows.filter((r) => r.id === "r0")).toHaveLength(1); // still the stale copy from page 1
  });
});
