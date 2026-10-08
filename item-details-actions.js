/* =========================================================
   ITEM DETAILS — ACTION ROUTING
   Include this AFTER the existing item-details page script.
   It replaces the temporary popup behavior without changing layout.
========================================================= */
(function () {
  function init() {
    const originalButton = document.getElementById("primaryAction");

    if (!originalButton || typeof report === "undefined" || !report) {
      return;
    }

    // Clone removes the old temporary click listener while preserving
    // the exact button styling/content already in the page.
    const button = originalButton.cloneNode(true);
    originalButton.replaceWith(button);

    button.addEventListener("click", () => {
      const type = String(report.type || "").toLowerCase();

      if (type === "found") {
        // Both guests and registered users may submit ownership claims.
        window.location.href = `claim-item.html?id=${encodeURIComponent(report.id)}`;
        return;
      }

      if (type === "lost") {
        // Both guests and registered users may report that they found it.
        window.location.href = `return-item.html?id=${encodeURIComponent(report.id)}`;
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
