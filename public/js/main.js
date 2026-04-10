/**
 * CAFE - UI script (cleaned and class-driven)
 */

document.addEventListener("DOMContentLoaded", () => {
  handleNavigation();
  initializeFormHandlers();
  initializeQuantityControls();
  initializeSearch();
  initializeScrollEffects();
  initializeScrollReveal();
});

function handleNavigation() {
  const currentPath = window.location.pathname;

  document.querySelectorAll(".nav-link").forEach((link) => {
    const href = link.getAttribute("href");
    if (href === currentPath) {
      link.classList.add("active");
    }
  });
}

function initializeFormHandlers() {
  document.querySelectorAll("form").forEach((form) => {
    form.addEventListener("submit", (e) => {
      let isValid = true;

      form.querySelectorAll("[required]").forEach((field) => {
        const value = typeof field.value === "string" ? field.value.trim() : "";
        if (!value) {
          isValid = false;
          field.classList.add("is-invalid");
        } else {
          field.classList.remove("is-invalid");
        }
      });

      const quantityInput = form.querySelector('input[name="quantity"]');
      if (quantityInput) {
        const qty = parseInt(quantityInput.value, 10);
        if (Number.isNaN(qty) || qty < 1 || qty > 10) {
          isValid = false;
          quantityInput.classList.add("is-invalid");
        }
      }

      if (!isValid) {
        e.preventDefault();
      }
    });

    form.querySelectorAll(".form-control, .form-select").forEach((field) => {
      field.addEventListener("input", () => {
        if (field.value && field.value.trim()) {
          field.classList.remove("is-invalid");
        }
      });
    });
  });
}

function initializeQuantityControls() {
  document.querySelectorAll('[id^="plus-"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.id.replace("plus-", "");
      const input = document.getElementById(`quantity-${id}`);
      if (!input) return;

      const current = parseInt(input.value, 10);
      input.value = String(Math.min(10, current + 1));
      input.classList.add("quantity-bump");
      setTimeout(() => input.classList.remove("quantity-bump"), 180);
    });
  });

  document.querySelectorAll('[id^="minus-"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.id.replace("minus-", "");
      const input = document.getElementById(`quantity-${id}`);
      if (!input) return;

      const current = parseInt(input.value, 10);
      input.value = String(Math.max(1, current - 1));
      input.classList.add("quantity-bump");
      setTimeout(() => input.classList.remove("quantity-bump"), 180);
    });
  });
}

function initializeSearch() {
  const searchInput =
    document.getElementById("searchInput") ||
    document.querySelector(".search-input");
  if (!searchInput) return;

  searchInput.addEventListener(
    "input",
    debounce(() => {
      const query = searchInput.value.toLowerCase().trim();
      const cards = document.querySelectorAll(".menu-item, .food-card");
      let visibleCount = 0;

      cards.forEach((card) => {
        const text = card.textContent.toLowerCase();
        const visible = text.includes(query);
        card.style.display = visible ? "" : "none";
        if (visible) visibleCount += 1;
      });

      const existingNoResults = document.querySelector("[data-no-results]");
      if (visibleCount === 0 && !existingNoResults) {
        const msg = document.createElement("div");
        msg.setAttribute("data-no-results", "true");
        msg.className = "col-12 text-center py-4 text-muted";
        msg.textContent = "No items found matching your search.";
        document.querySelector(".row")?.appendChild(msg);
      }
      if (visibleCount > 0 && existingNoResults) {
        existingNoResults.remove();
      }
    }, 120),
  );
}

function initializeScrollEffects() {
  const navbar = document.querySelector(".navbar");
  if (navbar) {
    const setNavbarState = () => {
      if (window.scrollY > 24) {
        navbar.classList.add("navbar-scrolled");
      } else {
        navbar.classList.remove("navbar-scrolled");
      }
    };

    setNavbarState();
    window.addEventListener("scroll", setNavbarState, { passive: true });
  }

  createBackToTopButton();
}

function createBackToTopButton() {
  const button = document.createElement("button");
  button.className = "back-to-top-btn";
  button.type = "button";
  button.setAttribute("aria-label", "Back to top");
  button.innerHTML = '<i class="fas fa-arrow-up"></i>';
  document.body.appendChild(button);

  const setVisibility = () => {
    if (window.pageYOffset > 320) {
      button.classList.add("show");
    } else {
      button.classList.remove("show");
    }
  };

  setVisibility();
  window.addEventListener("scroll", setVisibility, { passive: true });
  button.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

function initializeScrollReveal() {
  if (!("IntersectionObserver" in window)) return;

  const revealTargets = document.querySelectorAll(
    ".food-card, .feature-card, .gallery-item, .admin-stat-card, [data-reveal]",
  );
  if (!revealTargets.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1, rootMargin: "0px 0px -40px 0px" },
  );

  revealTargets.forEach((el) => {
    el.classList.add("reveal-on-scroll");
    observer.observe(el);
  });
}

function debounce(fn, wait) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), wait);
  };
}
