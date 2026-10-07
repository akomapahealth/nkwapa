/**
 * Where the theme preference is kept in localStorage.
 *
 * In its own module, without `'use client'`, because the root layout is a server component and
 * reads it to build the pre-paint theme script (#117). Imported from a client module, the server
 * receives a client-reference stub instead of the string; interpolating that stub wrote a function
 * body into the inline script, whose apostrophe ended the string literal early, so the script threw
 * `SyntaxError: missing ) after argument list` on every page load and never set the theme.
 */
export const themeStorageKey = 'nkwapa-theme';
