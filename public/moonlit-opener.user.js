// ==UserScript==
// @name         Open in Moonlit
// @namespace    http://tampermonkey.net/
// @version      1.5
// @description  Adds a draggable floating button to open the current video in Moonlit
// @author       Moonlit
// @match        *://www.youtube.com/*
// @match        *://music.youtube.com/*
// @match        *://www.tiktok.com/*
// @icon         https://moonlit.wastu.net/favicon.ico
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  const MOONLIT_BASE = "https://moonlit.wastu.net";
  const PRIMARY_COLOR = "#5F3DC4";
  const ICON_COLOR = "#F3F0FF";

  function openInMoonlit() {
    const url = new URL(window.location.href);
    url.hostname = "moonlit.wastu.net";

    // Allow only essential parameters (v=video, t=timestamp, list=playlist, index=playlist_index)
    // This strips tracking params like 'si', 'pp', 'feature', etc.
    const allowedParams = ["v", "t", "list", "index"];
    const keys = Array.from(url.searchParams.keys());
    for (const key of keys) {
      if (!allowedParams.includes(key)) {
        url.searchParams.delete(key);
      }
    }

    window.open(url.href, "_blank");
  }

  // Create SVG element without innerHTML (Trusted Types compatible)
  function createMoonIcon() {
    // Reduced size for 36px button (standard icon size usually 20-24px, let's use 20px)
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "20");
    svg.setAttribute("height", "20");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("fill", ICON_COLOR);

    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("fill", "currentColor");

    const path1 = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "path",
    );
    path1.setAttribute(
      "d",
      "M6 .278a.768.768 0 0 1 .08.858a7.208 7.208 0 0 0-.878 3.46c0 4.021 3.278 7.277 7.318 7.277c.527 0 1.04-.055 1.533-.16a.787.787 0 0 1 .81.316a.733.733 0 0 1-.031.893A8.349 8.349 0 0 1 8.344 16C3.734 16 0 12.286 0 7.71C0 4.266 2.114 1.312 5.124.06A.752.752 0 0 1 6 .278z",
    );

    const path2 = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "path",
    );
    path2.setAttribute(
      "d",
      "M10.794 3.148a.217.217 0 0 1 .412 0l.387 1.162c.173.518.579.924 1.097 1.097l1.162.387a.217.217 0 0 1 0 .412l-1.162.387a1.734 1.734 0 0 0-1.097 1.097l-.387 1.162a.217.217 0 0 1-.412 0l-.387-1.162A1.734 1.734 0 0 0 9.31 6.593l-1.162-.387a.217.217 0 0 1 0-.412l1.162-.387a1.734 1.734 0 0 0 1.097-1.097l.387-1.162zM13.863.099a.145.145 0 0 1 .274 0l.258.774c.115.346.386.617.732.732l.774.258a.145.145 0 0 1 0 .274l-.774.258a1.156 1.156 0 0 0-.732.732l-.258.774a.145.145 0 0 1-.274 0l-.258-.774a1.156 1.156 0 0 0-.732-.732l-.774-.258a.145.145 0 0 1 0-.274l.774-.258c.346-.115.617-.386.732-.732L13.863.1z",
    );

    g.appendChild(path1);
    g.appendChild(path2);
    svg.appendChild(g);

    return svg;
  }

  function init() {
    // --- Styles ---
    const style = document.createElement("style");
    style.textContent = `
            #moonlit-floating-btn {
                position: fixed;
                width: 36px;
                height: 36px;
                background-color: ${PRIMARY_COLOR};
                color: ${ICON_COLOR};
                backdrop-filter: blur(4px);
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 10px; /* Tighter radius for smaller button */
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                z-index: 2147483647; 
                box-shadow: 0 2px 8px rgba(0,0,0,0.35); /* Reduced shadow */
                user-select: none;
                transition: transform 0.1s;
                touch-action: none;
            }
            #moonlit-floating-btn:hover {
                filter: brightness(1.2);
                transform: scale(1.05);
            }
            #moonlit-floating-btn:active {
                transform: scale(0.95);
            }
        `;
    document.head.appendChild(style);

    // --- Button Construction ---
    const btn = document.createElement("div");
    btn.id = "moonlit-floating-btn";
    btn.title = "Open in Moonlit (Drag to move)";
    btn.appendChild(createMoonIcon());

    // Restore position
    try {
      const savedPos = JSON.parse(
        localStorage.getItem("moonlit_btn_pos") ||
          '{"top":"85px","right":"24px"}',
      );
      if (savedPos.top) btn.style.top = savedPos.top;
      if (savedPos.left) btn.style.left = savedPos.left;
      if (savedPos.right) btn.style.right = savedPos.right;
      if (savedPos.bottom) btn.style.bottom = savedPos.bottom;
    } catch (e) {
      btn.style.top = "85px";
      btn.style.right = "24px";
    }

    document.body.appendChild(btn);

    // --- Drag Logic ---
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;
    let hasMoved = false;

    btn.addEventListener("mousedown", (e) => {
      isDragging = true;
      hasMoved = false;
      startX = e.clientX;
      startY = e.clientY;
      const rect = btn.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;

      btn.style.right = "auto";
      btn.style.bottom = "auto";
      btn.style.left = `${initialLeft}px`;
      btn.style.top = `${initialTop}px`;
      btn.style.cursor = "grabbing";
      e.preventDefault();
    });

    window.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) hasMoved = true;
      btn.style.left = `${initialLeft + dx}px`;
      btn.style.top = `${initialTop + dy}px`;
    });

    window.addEventListener("mouseup", () => {
      if (!isDragging) return;
      isDragging = false;
      btn.style.cursor = "pointer";
      const rect = btn.getBoundingClientRect();
      localStorage.setItem(
        "moonlit_btn_pos",
        JSON.stringify({
          top: `${rect.top}px`,
          left: `${rect.left}px`,
        }),
      );
    });

    btn.addEventListener("click", () => {
      if (!hasMoved) openInMoonlit();
    });

    // --- Visibility Logic ---
    function checkVisibility() {
      const url = window.location.href;
      let shouldShow = false;

      if (url.includes("youtube.com/watch")) shouldShow = true;
      if (url.includes("youtube.com/shorts/")) shouldShow = true;
      if (url.includes("music.youtube.com/watch")) shouldShow = true;
      if (url.includes("tiktok.com") && url.includes("/video/"))
        shouldShow = true;

      btn.style.display = shouldShow ? "flex" : "none";
    }

    // --- Robust Observation ---
    window.addEventListener("popstate", checkVisibility);
    window.addEventListener("yt-navigate-finish", checkVisibility);
    window.addEventListener("yt-page-data-updated", checkVisibility);

    setInterval(checkVisibility, 500);

    const observer = new MutationObserver((mutations) => {
      if (!document.body.contains(btn)) {
        document.body.appendChild(btn);
        checkVisibility();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    checkVisibility();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
