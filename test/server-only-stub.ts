// vitest stub for Next's "server-only" package. That import exists to make a
// build FAIL if server code is pulled into a client bundle, which is a real
// guarantee worth keeping in the app. The Node test runner is neither, so it
// would throw on import and take the whole suite down with it. Aliasing it here
// keeps the guard in the build and out of the tests.
export {};
