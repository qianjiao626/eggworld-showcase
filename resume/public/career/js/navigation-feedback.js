(() => {
    "use strict";

    const COMPLETE_EVENT = "navigation-feedback:complete";
    const HREF_ATTRIBUTE = "data-navigation-href";
    const PENDING_ATTRIBUTE = "data-navigation-pending";
    const DELAY_MS = 150;
    const TIMEOUT_MS = 8000;
    const pendingElements = new Map();
    const prefetchedUrls = new Set();

    function isModifiedClick(event) {
        return event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
    }

    function getNavigationTarget(event) {
        if (isModifiedClick(event) || !(event.target instanceof Element)) return null;

        const element = event.target.closest(`a[href], [${HREF_ATTRIBUTE}]`);
        if (!(element instanceof HTMLElement)) return null;

        if (element instanceof HTMLAnchorElement && (element.download || (element.target && element.target !== "_self"))) {
            return null;
        }

        const rawHref = element instanceof HTMLAnchorElement
            ? element.getAttribute("href")
            : element.getAttribute(HREF_ATTRIBUTE);

        if (!rawHref || rawHref.startsWith("#") || /^(mailto:|tel:|javascript:)/i.test(rawHref)) {
            return null;
        }

        let url;
        try {
            url = new URL(rawHref, window.location.href);
        } catch {
            return null;
        }

        if (!/^https?:$/.test(url.protocol) || url.origin !== window.location.origin || url.href === window.location.href) {
            return null;
        }

        if (url.pathname === window.location.pathname && url.search === window.location.search && url.hash) {
            return null;
        }

        return { element, url };
    }

    function resetElement(element) {
        const state = pendingElements.get(element);
        if (!state) return;

        window.clearTimeout(state.delayTimer);
        window.clearTimeout(state.timeoutTimer);
        element.removeAttribute(PENDING_ATTRIBUTE);

        if (state.previousAriaBusy === null) {
            element.removeAttribute("aria-busy");
        } else {
            element.setAttribute("aria-busy", state.previousAriaBusy);
        }

        if (state.isProgrammaticButton) {
            element.disabled = state.previousDisabled;

            if (state.previousAriaDisabled === null) {
                element.removeAttribute("aria-disabled");
            } else {
                element.setAttribute("aria-disabled", state.previousAriaDisabled);
            }
        }

        pendingElements.delete(element);
    }

    function resetAll() {
        Array.from(pendingElements.keys()).forEach(resetElement);
    }

    function showTimeoutToast() {
        const existingToast = document.querySelector(".navigation-feedback-toast");
        if (existingToast) existingToast.remove();

        const toast = document.createElement("div");
        toast.className = "navigation-feedback-toast";
        toast.setAttribute("role", "status");
        toast.textContent = "页面暂时未响应，请重试";
        document.body.appendChild(toast);
        window.setTimeout(() => toast.remove(), 3000);
    }

    function startNavigation(element) {
        if (pendingElements.has(element)) return false;

        const isProgrammaticButton = element instanceof HTMLButtonElement && element.hasAttribute(HREF_ATTRIBUTE);
        const state = {
            previousAriaBusy: element.getAttribute("aria-busy"),
            previousAriaDisabled: isProgrammaticButton ? element.getAttribute("aria-disabled") : null,
            previousDisabled: isProgrammaticButton ? element.disabled : false,
            isProgrammaticButton,
            delayTimer: window.setTimeout(() => {
                element.setAttribute(PENDING_ATTRIBUTE, "delayed");
            }, DELAY_MS),
            timeoutTimer: window.setTimeout(() => {
                resetElement(element);
                showTimeoutToast();
            }, TIMEOUT_MS),
        };

        pendingElements.set(element, state);
        element.setAttribute(PENDING_ATTRIBUTE, "true");
        element.setAttribute("aria-busy", "true");

        if (isProgrammaticButton) {
            Promise.resolve().then(() => {
                if (!pendingElements.has(element)) return;
                element.disabled = true;
                element.setAttribute("aria-disabled", "true");
            });
        }

        return true;
    }

    function handleClick(event) {
        const target = getNavigationTarget(event);
        if (!target) return;

        if (startNavigation(target.element)) return;

        event.preventDefault();
        event.stopImmediatePropagation();
    }

    function prefetchTarget(event) {
        const target = getNavigationTarget({
            target: event.target,
            button: 0,
            metaKey: false,
            ctrlKey: false,
            shiftKey: false,
            altKey: false,
        });

        if (!target || prefetchedUrls.has(target.url.href)) return;

        prefetchedUrls.add(target.url.href);
        const link = document.createElement("link");
        link.rel = "prefetch";
        link.href = target.url.href;
        document.head.appendChild(link);
    }

    document.addEventListener("click", handleClick, true);
    document.addEventListener("pointerover", prefetchTarget, { capture: true, passive: true });
    document.addEventListener("focusin", prefetchTarget, true);
    window.addEventListener(COMPLETE_EVENT, resetAll);
    window.addEventListener("pageshow", resetAll);
    window.addEventListener("popstate", resetAll);
})();
