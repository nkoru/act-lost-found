/* =========================================================
   ACT LOST & FOUND — SHARED SESSION HELPERS

   Prototype only:
   localStorage is NOT production authentication.
========================================================= */

(function () {
  const SESSION_KEY = "act_session";

  /* =========================================================
     SESSION
  ========================================================= */

  function getSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);

      if (!raw) return null;

      const session = JSON.parse(raw);

      if (!session || typeof session !== "object") {
        return null;
      }

      if (!session.loggedIn) {
        return null;
      }

      const role = String(session.role || "").toLowerCase();

      if (role !== "user" && role !== "admin") {
        return null;
      }

      return {
        ...session,
        role,
      };
    } catch {
      return null;
    }
  }

  function isLoggedIn() {
    return Boolean(getSession());
  }

  function isUser() {
    return getSession()?.role === "user";
  }

  function isAdmin() {
    return getSession()?.role === "admin";
  }

  /* =========================================================
     PAGE / REDIRECT HELPERS
  ========================================================= */

  function currentPage() {
    const file = window.location.pathname.split("/").pop() || "index.html";

    return `${file}${window.location.search}${window.location.hash}`;
  }

  function safeLocalRedirect(value) {
    if (!value) return null;

    try {
      const decoded = decodeURIComponent(value).trim();

      if (!decoded) return null;

      const url = new URL(decoded, window.location.href);

      /*
        Only allow same-origin navigation.
        Blocks javascript:, data:, external domains, etc.
      */
      if (url.origin !== window.location.origin) {
        return null;
      }

      const currentDirectory = window.location.pathname.substring(
        0,
        window.location.pathname.lastIndexOf("/") + 1,
      );

      /*
        Keep redirects inside the ACT Lost & Found
        project directory.
      */
      if (!url.pathname.startsWith(currentDirectory)) {
        return null;
      }

      return `${url.pathname.split("/").pop()}${url.search}${url.hash}`;
    } catch {
      return null;
    }
  }

  function loginUrl(target = currentPage()) {
    const safeTarget = safeLocalRedirect(target) || "index.html";

    return `login.html?redirect=${encodeURIComponent(safeTarget)}`;
  }

  function accountUrl(session = getSession()) {
    if (!session) {
      return "login.html";
    }

    if (session.role === "admin") {
      return "admin-dashboard.html";
    }

    return "user-dashboard.html";
  }

  /* =========================================================
     LOGOUT
  ========================================================= */

  function logout() {
    localStorage.removeItem(SESSION_KEY);

    window.location.href = "login.html";
  }

  /* =========================================================
     PAGE PROTECTION
  ========================================================= */

  function requireLogin() {
    const session = getSession();

    if (!session) {
      window.location.replace(loginUrl(currentPage()));

      return null;
    }

    return session;
  }

  function requireUser() {
    const session = getSession();

    if (!session) {
      window.location.replace(loginUrl(currentPage()));

      return null;
    }

    /*
      Admin should use the Admin Dashboard,
      not the regular User Dashboard.
    */
    if (session.role === "admin") {
      window.location.replace("admin-dashboard.html");

      return null;
    }

    return session;
  }

  function requireAdmin() {
    const session = getSession();

    if (!session) {
      window.location.replace(loginUrl(currentPage()));

      return null;
    }

    /*
      Normal users cannot enter admin pages.
    */
    if (session.role !== "admin") {
      window.location.replace("user-dashboard.html");

      return null;
    }

    return session;
  }

  /* =========================================================
     AUTH LINK HELPERS
  ========================================================= */

  function authLabel(session) {
    if (!session) {
      return "Log In";
    }

    return session.role === "admin" ? "Admin Dashboard" : "My Account";
  }

  function updateAuthElement(element, session) {
    /*
      data-force-login means:
      this link must ALWAYS remain a Login link.
    */
    if (element.hasAttribute("data-force-login")) {
      element.href = "login.html";
      return;
    }

    element.href = session ? accountUrl(session) : "login.html";

    const label = authLabel(session);

    /*
      Recommended structure:

      <a data-auth-link>
        <span data-auth-label>Log In</span>
      </a>

      This preserves icons and other child elements.
    */
    const labelElement = element.querySelector("[data-auth-label]");

    if (labelElement) {
      labelElement.textContent = label;
      return;
    }

    /*
      Only replace textContent when the link
      contains no child elements.

      This prevents session.js from destroying
      styled cards, icons, arrows, etc.
    */
    if (element.children.length === 0) {
      element.textContent = label;
    }
  }

  function updateNavbarAccountLinks() {
    const session = getSession();

    document.querySelectorAll("[data-auth-link]").forEach((element) => {
      updateAuthElement(element, session);
    });
  }

  /* =========================================================
     LOGOUT BUTTONS
  ========================================================= */

  function bindLogoutButtons() {
    document
      .querySelectorAll("[data-logout], #logoutButton")
      .forEach((button) => {
        /*
          Prevent accidentally registering
          this listener more than once.
        */
        if (button.dataset.logoutBound === "true") {
          return;
        }

        button.dataset.logoutBound = "true";

        button.addEventListener("click", (event) => {
          event.preventDefault();
          logout();
        });
      });
  }

  /* =========================================================
     GUEST CASE SHORTCUT
  ========================================================= */

  function readGuestCases() {
    try {
      const stored = JSON.parse(
        localStorage.getItem("act_guest_cases") || "[]",
      );

      return Array.isArray(stored) ? stored : [];
    } catch {
      return [];
    }
  }

  function hasLegacyGuestCase() {
    try {
      const keys = ["act_reports", "act_claims", "act_returns"];

      return keys.some((key) => {
        const source = JSON.parse(localStorage.getItem(key) || "[]");

        return (
          Array.isArray(source) &&
          source.some((item) => Boolean(item?.guestAccessCode))
        );
      });
    } catch {
      return false;
    }
  }

  function injectGuestCaseShortcut() {
    /*
      Logged-in users already have dashboards.
    */
    if (getSession()) {
      return;
    }

    const cases = readGuestCases();

    if (!cases.length && !hasLegacyGuestCase()) {
      return;
    }

    const page = window.location.pathname.split("/").pop() || "index.html";

    /*
      Don't show the floating shortcut on pages
      where it would be redundant or visually noisy.
    */
    const excludedPages = [
      "guest-tracking.html",
      "return-coordination.html",
      "login.html",
    ];

    if (
      excludedPages.includes(page) ||
      document.getElementById("guestCaseShortcut")
    ) {
      return;
    }

    const link = document.createElement("a");

    link.id = "guestCaseShortcut";

    link.href = "guest-tracking.html";

    link.textContent = "Track Guest Case";

    link.setAttribute("aria-label", "Track your guest case");

    link.setAttribute(
      "style",
      [
        "position:fixed",
        "right:20px",
        "bottom:20px",
        "z-index:60",

        "display:inline-flex",
        "align-items:center",
        "justify-content:center",

        "padding:12px 16px",
        "border-radius:14px",

        "background:#0c2e8a",
        "color:#fff",

        "font-weight:800",
        "font-size:13px",

        "box-shadow:0 12px 30px rgba(12,46,138,.22)",
        "text-decoration:none",

        "transition:transform .2s ease,box-shadow .2s ease",
      ].join(";"),
    );

    link.addEventListener("mouseenter", () => {
      link.style.transform = "translateY(-2px)";
    });

    link.addEventListener("mouseleave", () => {
      link.style.transform = "translateY(0)";
    });

    document.body.appendChild(link);
  }

  /* =========================================================
     PUBLIC API
  ========================================================= */

  window.ACTAuth = {
    getSession,
    isLoggedIn,
    isUser,
    isAdmin,

    currentPage,
    safeLocalRedirect,
    loginUrl,
    accountUrl,

    logout,

    requireLogin,
    requireUser,
    requireAdmin,

    updateNavbarAccountLinks,
  };

  /* =========================================================
     INITIALIZATION
  ========================================================= */

  function init() {
    updateNavbarAccountLinks();
    bindLogoutButtons();
    injectGuestCaseShortcut();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
