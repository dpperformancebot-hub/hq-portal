export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "tjd-theme";
export const DEFAULT_THEME: Theme = "light";

// Inline script that runs before paint to set the theme class with no flash.
// Defaults to light. Reads the persisted preference from localStorage.
export const themeInitScript = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t!=="dark")t="light";var e=document.documentElement;e.classList.remove("light","dark");e.classList.add(t);}catch(e){document.documentElement.classList.add("light");}})();`;
