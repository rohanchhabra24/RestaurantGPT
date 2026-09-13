const KEY = "rgpt-theme";

export function getTheme() {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // Private browsing / blocked storage — the toggle still works for this
    // load, it just won't be remembered next time.
  }
}
