/**
 * FocusManager – tiny, central focus lock utility.
 * Locks focus to a target element within an optional scope and prevents mouse/touch
 * interactions from stealing focus. Safe in partial/non‑DOM environments.
 */
export class FocusManager {
  /** @type {null | { target: HTMLElement|null, scope: HTMLElement|null, allow: (el: Element|null)=>boolean, preserveScroll: boolean, cleanup: ()=>void }} */
  static _lock = null;

  /**
   * Lock focus to a target element. Any focus/mouse/touch interactions outside the
   * allowed set will be redirected to the target.
   * @param {HTMLElement|null} target
   * @param {{
   *   scope?: HTMLElement|null,
   *   allowedSelectors?: string|string[],
   *   allowedElements?: HTMLElement[],
   *   allowPredicate?: (el: Element|null)=>boolean,
   *   preserveScroll?: boolean
   * }} [opts]
   */
  static lock(target, opts = {}) {
    try {
      FocusManager.unlock();
    } catch {
      /* ignore */
    }
    if (!target) return;

    const scope = opts.scope || null;
    const preserveScroll = !!opts.preserveScroll;

    const selList = Array.isArray(opts.allowedSelectors)
      ? opts.allowedSelectors.slice()
      : opts.allowedSelectors
        ? [opts.allowedSelectors]
        : [];
    const els = Array.isArray(opts.allowedElements) ? opts.allowedElements.slice() : [];
    const allowPredicate = typeof opts.allowPredicate === "function" ? opts.allowPredicate : null;

    /** @param {Element|null} el */
    const isAllowed = (el) => {
      try {
        if (!el) return false;
        if (el === target) return true;
        if (
          els.length &&
          els.some(
            (e) =>
              e &&
              (el === e || (typeof el.closest === "function" && e.id && el.closest(`#${e.id}`)))
          )
        ) {
          return true;
        }
        if (selList.length) {
          for (const s of selList) {
            try {
              if (el.matches?.(s) || el.closest?.(s)) return true;
            } catch {
              /* ignore selector errors */
            }
          }
        }
        if (allowPredicate && allowPredicate(el)) return true;
        return false;
      } catch {
        return false;
      }
    };

    const focusTarget = () => {
      try {
        if (!target) return;
        if ("disabled" in target && target.disabled) return;
        if (target.classList?.contains?.("hidden")) return;
        try {
          target.focus({ preventScroll: true });
        } catch {
          try {
            const sx =
              typeof window.scrollX === "number" ? window.scrollX : window.pageXOffset || 0;
            const sy =
              typeof window.scrollY === "number" ? window.scrollY : window.pageYOffset || 0;
            target.focus();
            if (preserveScroll) window.scrollTo(sx, sy);
          } catch {
            /* ignore focus */
          }
        }
      } catch {
        /* ignore */
      }
    };

    /**
     * Global pointer/mouse/touch guard: when locked, prevent interactions with disallowed targets
     * from stealing focus. Runs in capture phase and halts further propagation.
     * @param {Event} e
     */
    const onMouseOrTouch = (e) => {
      try {
        const t = /** @type {Element|null} */ (e && /** @type {any} */ (e).target);
        if (isAllowed(t)) return;
        if (e.cancelable) e.preventDefault();
        try {
          /** @type {any} */ (e).stopImmediatePropagation?.();
        } catch {
          /* ignore */
        }
        if (typeof e.stopPropagation === "function") e.stopPropagation();
        focusTarget();
      } catch {
        /* ignore */
      }
    };

    /**
     * Focus-in guard: if moving focus to a disallowed element, immediately snap back to target.
     * Stop propagation so downstream handlers cannot re-route focus elsewhere.
     * @param {FocusEvent} e
     */
    const onFocusIn = (e) => {
      try {
        const t = /** @type {Element|null} */ (e && /** @type {any} */ (e).target);
        if (isAllowed(t)) return;
        try {
          /** @type {any} */ (e).stopImmediatePropagation?.();
        } catch {
          /* ignore */
        }
        if (typeof e.stopPropagation === "function") e.stopPropagation();
        focusTarget();
      } catch {
        /* ignore */
      }
    };

    /**
     * Focus-out guard: if blur would lead outside allowed set, re-focus target on next tick.
     * Stop propagation so other handlers don't seize focus after blur.
     * @param {FocusEvent} e
     */
    const onFocusOut = (e) => {
      try {
        const fromEl = /** @type {Element|null} */ (e && /** @type {any} */ (e).target);
        const toEl = /** @type {Element|null} */ (e && /** @type {any} */ (e).relatedTarget);
        const inScopeFrom = scope
          ? !!(fromEl && (fromEl === scope || scope.contains(fromEl)))
          : true;
        const inScopeTo = scope ? !!(toEl && (toEl === scope || scope.contains(toEl))) : true;
        if (!inScopeFrom && !inScopeTo) return;
        if (isAllowed(toEl)) return;
        try {
          /** @type {any} */ (e).stopImmediatePropagation?.();
        } catch {
          /* ignore */
        }
        if (typeof e.stopPropagation === "function") e.stopPropagation();
        setTimeout(() => focusTarget(), 0);
      } catch {
        /* ignore */
      }
    };

    try {
      const touchOpts = { passive: false, capture: true };
      const mouseOpts = /** @type {AddEventListenerOptions} */ ({ capture: true });
      const pointerOpts = /** @type {AddEventListenerOptions} */ ({ capture: true });
      const doc = typeof document !== "undefined" ? document : null;
      if (!doc) return;
      try {
        doc.addEventListener("pointerdown", onMouseOrTouch, pointerOpts);
      } catch {
        /* ignore */
      }
      try {
        doc.addEventListener("pointerup", onMouseOrTouch, pointerOpts);
      } catch {
        /* ignore */
      }
      doc.addEventListener("mousedown", onMouseOrTouch, mouseOpts);
      doc.addEventListener("touchstart", onMouseOrTouch, touchOpts);
      doc.addEventListener("mouseup", onMouseOrTouch, mouseOpts);
      doc.addEventListener("click", onMouseOrTouch, mouseOpts);
      document.addEventListener("focusin", onFocusIn, true);
      document.addEventListener("focusout", onFocusOut, true);

      focusTarget();
      try {
        target.classList?.add?.("js-force-focus");
      } catch {
        /* ignore */
      }

      FocusManager._lock = {
        target,
        scope,
        allow: isAllowed,
        preserveScroll,
        cleanup: () => {
          try {
            doc.removeEventListener("pointerdown", onMouseOrTouch, pointerOpts);
          } catch {
            /* ignore */
          }
          try {
            doc.removeEventListener("pointerup", onMouseOrTouch, pointerOpts);
          } catch {
            /* ignore */
          }
          try {
            doc.removeEventListener("mousedown", onMouseOrTouch, mouseOpts);
          } catch {
            /* ignore */
          }
          try {
            doc.removeEventListener("touchstart", onMouseOrTouch, touchOpts);
          } catch {
            /* ignore */
          }
          try {
            doc.removeEventListener("mouseup", onMouseOrTouch, mouseOpts);
          } catch {
            /* ignore */
          }
          try {
            doc.removeEventListener("click", onMouseOrTouch, mouseOpts);
          } catch {
            /* ignore */
          }
          try {
            document.removeEventListener("focusin", onFocusIn, true);
          } catch {
            /* ignore */
          }
          try {
            document.removeEventListener("focusout", onFocusOut, true);
          } catch {
            /* ignore */
          }
          try {
            target?.classList?.remove?.("js-force-focus");
          } catch {
            /* ignore */
          }
        },
      };
    } catch {
      /* ignore listener issues */
    }
  }

  /** Remove any active focus lock. */
  static unlock() {
    const l = FocusManager._lock;
    FocusManager._lock = null;
    if (!l) return;
    try {
      l.cleanup();
    } catch {
      /* ignore */
    }
  }

  /** @returns {boolean} */
  static isActive() {
    return !!FocusManager._lock;
  }
}
