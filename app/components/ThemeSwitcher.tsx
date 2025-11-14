"use client";

import { useTheme } from "next-themes";
import { useEffect, useState, startTransition } from "react";

export default function ThemeSwitcher() {
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Set mounted after hydration to avoid mismatch
  useEffect(() => {
    startTransition(() => {
      setMounted(true);
    });
  }, []);

  if (!mounted) {
    return (
      <div className="p-6 pt-4">
        <button
          type="button"
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
          aria-label="Toggle theme"
        >
          <div className="w-5 h-5" />
          <span>Toggle theme</span>
        </button>
      </div>
    );
  }

  // Determine if dark mode is active
  // Use resolvedTheme if available, otherwise check the document class
  const getIsDark = () => {
    if (resolvedTheme) {
      return resolvedTheme === "dark";
    }
    if (typeof window !== "undefined") {
      return document.documentElement.classList.contains("dark");
    }
    return false;
  };

  const isDark = getIsDark();

  const handleToggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const newTheme = isDark ? "light" : "dark";
    setTheme(newTheme);
  };

  return (
    <div className="p-6 pt-[15px] border-t border-gray-200 dark:border-gray-800">
      <button
        type="button"
        onClick={handleToggle}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
        aria-label="Toggle theme"
      >
        {isDark ? (
          <>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-5 h-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 3v2.25m6.364 6.364l-1.591 1.591M21 12h-2.25m-6.364 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z"
              />
            </svg>
            <span>Light mode</span>
          </>
        ) : (
          <>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-5 h-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z"
              />
            </svg>
            <span>Dark mode</span>
          </>
        )}
      </button>
    </div>
  );
}
