/* =========================================================
   ACT LOST & FOUND — SHARED MOTION CONTROLLER
========================================================= */

(function () {
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  if (reducedMotion) return;

  const page = window.location.pathname.split("/").pop() || "index.html";

  /*
    These pages already have their own custom animation systems.
    Don't stack another system on top of them.
  */
  const customMotionPages = new Set([
    "index.html",
    "about.html",
    "help.html",
    "login.html",
    "report-lost.html",
    "report-found.html",
    "lost-items.html",
    "found-items.html",
    "all-reports.html",
  ]);

  if (customMotionPages.has(page)) {
    return;
  }

  /* =======================================================
     INTERSECTION OBSERVER
  ======================================================= */

  const observer = new IntersectionObserver(
    (entries, currentObserver) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;

        entry.target.classList.add("is-visible");

        currentObserver.unobserve(entry.target);
      });
    },
    {
      threshold: 0.14,
      rootMargin: "0px 0px -45px 0px",
    },
  );

  function reveal(element, type = "up", delay = 0) {
    if (!element) return;

    if (element.dataset.actRevealBound === "true") {
      return;
    }

    element.dataset.actRevealBound = "true";

    element.classList.add("act-reveal", `act-${type}`);

    element.style.setProperty("--act-delay", `${delay}ms`);

    observer.observe(element);
  }

  function revealAll(selector, type = "up", stagger = 0) {
    document.querySelectorAll(selector).forEach((element, index) => {
      reveal(element, type, index * stagger);
    });
  }

  /* =======================================================
     HERO / PAGE HEADER
  ======================================================= */

  function animateHero() {
    const hero = document.querySelector("main > section:first-child");

    if (!hero) return;

    const heroContent = hero.querySelector(
      ":scope > div.relative[class*='mx-auto']",
    );

    if (!heroContent) return;

    const elements = heroContent.querySelectorAll(
      "a, h1, h2, p, " + "[class*='rounded-full'], " + ".grid > div",
    );

    elements.forEach((element, index) => {
      if (index > 8) return;

      element.classList.add("act-page-enter");

      element.style.setProperty("--act-delay", `${80 + index * 85}ms`);
    });
  }

  /* =======================================================
     DASHBOARDS
  ======================================================= */

  function animateDashboard() {
    revealAll(
      "main > section:nth-of-type(2) > .grid:first-child > *",
      "scale",
      85,
    );

    reveal(
      document.querySelector("main > section:nth-of-type(2) > .mt-8"),
      "up",
      100,
    );
  }

  /* =======================================================
     CLAIM / RETURN FORMS
  ======================================================= */

  function animateActionForm() {
    reveal(document.querySelector("#formState aside"), "left");

    reveal(document.querySelector("#formState form"), "right", 100);

    reveal(document.querySelector("#successState > div > div"), "scale");

    reveal(document.querySelector("#notFoundState > div"), "scale");
  }

  /* =======================================================
     ITEM DETAILS
  ======================================================= */

  function animateItemDetails() {
    reveal(document.querySelector("main > section:first-child > div"), "up");

    const detailColumns = document.querySelectorAll(
      "#itemDetailsState > div.grid > *",
    );

    detailColumns.forEach((element, index) => {
      reveal(element, index === 0 ? "left" : "right", index * 100);
    });

    reveal(document.querySelector("#safetySection > div"), "up", 100);
  }

  /* =======================================================
     GUEST TRACKING
  ======================================================= */

  function animateGuestTracking() {
    reveal(document.querySelector("#trackingForm"), "up");

    reveal(document.querySelector("#recentCasesSection"), "scale");

    reveal(document.querySelector("#resultState"), "scale");
  }

  /* =======================================================
     RETURN COORDINATION
  ======================================================= */

  function animateCoordination() {
    reveal(document.querySelector("#unauthorizedState > div > div"), "scale");

    const columns = document.querySelectorAll(
      "#caseState > div > div.grid > *",
    );

    columns.forEach((element, index) => {
      reveal(element, index === 0 ? "left" : "right", index * 100);
    });
  }

  /* =======================================================
     LOST / FOUND / ALL REPORT DIRECTORIES
  ======================================================= */

  function animateDirectory() {
    const contentWrapper = document.querySelector(
      "main > section:nth-of-type(2) " + "> div.relative[class*='mx-auto']",
    );

    if (contentWrapper) {
      const children = Array.from(contentWrapper.children);

      /*
        First real block = filters/search panel.
        Second = section heading.
      */
      if (children[0]) {
        reveal(children[0], "up");
      }

      if (children[1]) {
        reveal(children[1], "up", 100);
      }
    }

    reveal(
      document.querySelector("main > section:nth-of-type(3) > div > div"),
      "scale",
    );

    animateDynamicLists();
  }

  /* =======================================================
     DYNAMIC CONTENT
  ======================================================= */

  const dynamicContainers = [
    "#reportsGrid",
    "#lostReportsGrid",
    "#foundReportsGrid",
    "#dashboardList",
    "#adminList",
    "#recentCasesList",
    "#messageList",
  ];

  function animateChildren(container) {
    if (!container) return;

    Array.from(container.children).forEach((child, index) => {
      if (child.dataset.actDynamicAnimated === "true") {
        return;
      }

      child.dataset.actDynamicAnimated = "true";

      child.classList.add("act-dynamic-enter");

      child.style.setProperty("--act-delay", `${Math.min(index * 70, 350)}ms`);
    });
  }

  function animateDynamicLists() {
    dynamicContainers.forEach((selector) => {
      animateChildren(document.querySelector(selector));
    });
  }

  /* =======================================================
     WATCH FOR NEW REPORTS / TABS / MESSAGES
  ======================================================= */

  function watchDynamicContent() {
    const main = document.querySelector("main");

    if (!main) return;

    const mutationObserver = new MutationObserver((mutations) => {
      let needsUpdate = false;

      mutations.forEach((mutation) => {
        if (mutation.addedNodes.length) {
          needsUpdate = true;
        }
      });

      if (needsUpdate) {
        requestAnimationFrame(() => {
          animateDynamicLists();
        });
      }
    });

    mutationObserver.observe(main, {
      childList: true,
      subtree: true,
    });
  }

  /* =======================================================
     PAGE-SPECIFIC SETUP
  ======================================================= */

  function init() {
    /* Page opening / hero animation */
    animateHero();

    /* Shared interaction effects */
    setupCardHover();
    setupTabAnimations();
    setupMobileMenuAnimation();

    /* Page-specific scroll animations */
    switch (page) {
      case "user-dashboard.html":
      case "admin-dashboard.html":
        animateDashboard();
        break;

      case "claim-item.html":
      case "return-item.html":
        animateActionForm();
        break;

      case "item-details.html":
        animateItemDetails();
        break;

      case "guest-tracking.html":
        animateGuestTracking();
        break;

      case "return-coordination.html":
        animateCoordination();
        break;

      case "lost-items.html":
      case "found-items.html":
      case "all-reports.html":
        animateDirectory();
        break;
    }

    /* Animate dynamically-created cards / reports */
    animateDynamicLists();

    /* Watch for new content added by JavaScript */
    watchDynamicContent();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

function setupCardHover() {
  document
    .querySelectorAll(
      "main article, " + "main .report-card, " + "main [class*='shadow-soft']",
    )
    .forEach((card) => {
      card.classList.add("act-hover-card");
    });
}

function setupTabAnimations() {
  document.querySelectorAll(".tab, .tab-button").forEach((button) => {
    button.addEventListener("click", () => {
      requestAnimationFrame(() => {
        const candidates = document.querySelectorAll(
          "[data-tab-panel]:not(.hidden), " + ".tab-panel:not(.hidden)",
        );

        candidates.forEach((panel) => {
          panel.classList.remove("act-tab-enter");

          void panel.offsetWidth;

          panel.classList.add("act-tab-enter");
        });
      });
    });
  });
}

function setupMobileMenuAnimation() {
  const menuButton = document.getElementById("menuButton");

  const mobileMenu = document.getElementById("mobileMenu");

  if (!menuButton || !mobileMenu) return;

  menuButton.addEventListener("click", () => {
    requestAnimationFrame(() => {
      if (mobileMenu.classList.contains("hidden")) {
        return;
      }

      mobileMenu.classList.remove("act-mobile-menu-enter");

      void mobileMenu.offsetWidth;

      mobileMenu.classList.add("act-mobile-menu-enter");
    });
  });
}
