
/* assets/bundle-builder.js */
/* global Shopify */
'use strict';

(function () {

  /* ───────────────────────────────────────────
     STATE
  ─────────────────────────────────────────── */
  const state = {
    currentStep: 1,
    totalSteps: 4,
    selections: {
      shirt: null,       // { productId, variantId, title, price, image, step }
      accessory: null,
      extras: []         // array of same shape
    },
    loadedSteps: new Set([1]),
    isSubmitting: false
  };

  /* ───────────────────────────────────────────
     CONFIG (read from section data-attributes)
  ─────────────────────────────────────────── */
  let config = {};

  /* ───────────────────────────────────────────
     DOM REFS
  ─────────────────────────────────────────── */
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

  let wrapper, progressSteps, progressLines, stepEls,
      reviewEl, atcBtn, confirmationEl;

  /* ───────────────────────────────────────────
     INIT
  ─────────────────────────────────────────── */
  function init () {
    wrapper = $('#bundle-builder');
    if (!wrapper) return;

    config = {
      tiers: [
        { threshold: +wrapper.dataset.tier1Threshold, discount: +wrapper.dataset.tier1Discount },
        { threshold: +wrapper.dataset.tier2Threshold, discount: +wrapper.dataset.tier2Discount },
        { threshold: +wrapper.dataset.tier3Threshold, discount: +wrapper.dataset.tier3Discount }
      ],
      enableExtras: wrapper.dataset.enableExtras === 'true',
      totalSteps: +wrapper.dataset.totalSteps
    };

    state.totalSteps = config.totalSteps;

    progressSteps = $$('.bb-progress__step', wrapper);
    progressLines = $$('.bb-progress__line-fill', wrapper);
    stepEls       = $$('.bb-step', wrapper);
    reviewEl      = $('#bb-review-summary', wrapper);
    atcBtn        = $('#bb-atc-btn', wrapper);
    confirmationEl= $('#bb-confirmation', wrapper);

    bindEvents();
    updateProgress();
    updatePricingSummary();
  }

  /* ───────────────────────────────────────────
     EVENT BINDING
  ─────────────────────────────────────────── */
  function bindEvents () {
    // Product card clicks + keyboard
    wrapper.addEventListener('click',   onWrapperClick);
    wrapper.addEventListener('keydown', onWrapperKeydown);

    // Variant select changes
    wrapper.addEventListener('change', onVariantChange);

    // Navigation buttons
    $$('.bb-btn--next', wrapper).forEach(btn => btn.addEventListener('click', onNextClick));
    $$('.bb-btn--prev', wrapper).forEach(btn => btn.addEventListener('click', onPrevClick));

    // ATC
    if (atcBtn) atcBtn.addEventListener('click', onAddToCart);

    // Mobile bar toggle
    const mobToggle = $('#bb-mob-toggle');
    const mobClose  = $('#bb-mob-close');
    const mobSheet  = $('#bb-mobile-sheet');
    if (mobToggle) {
      mobToggle.addEventListener('click', () => {
        const open = mobSheet.classList.toggle('bb-mobile-sheet--open');
        mobToggle.setAttribute('aria-expanded', open);
        mobSheet.setAttribute('aria-hidden', !open);
        if (open) mobSheet.querySelector('.bb-mobile-sheet__close').focus();
      });
    }
    if (mobClose) {
      mobClose.addEventListener('click', () => {
        mobSheet.classList.remove('bb-mobile-sheet--open');
        mobToggle.setAttribute('aria-expanded', 'false');
        mobSheet.setAttribute('aria-hidden', 'true');
        mobToggle.focus();
      });
    }

    // Sticky mobile bar behaviour
    initMobileBarScroll();
  }

  function onWrapperClick (e) {
    const card = e.target.closest('.bb-card');
    if (!card) return;
    // Ignore clicks on the variant select itself
    if (e.target.closest('.bb-card__variant-select')) return;
    toggleCard(card);
  }

  function onWrapperKeydown (e) {
    const card = e.target.closest('.bb-card');
    if (!card) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleCard(card);
    }
  }

  function onVariantChange (e) {
    if (!e.target.classList.contains('bb-card__variant-select')) return;
    const card = e.target.closest('.bb-card');
    if (!card || !card.classList.contains('bb-card--selected')) return;
    // Update stored selection with new variant
    const productId = card.dataset.productId;
    const step      = +card.dataset.step;
    const variantId = e.target.value;
    const price     = +e.target.selectedOptions[0].dataset.price;
    updateSelectionVariant(step, productId, variantId, price);
    updatePricingSummary();
  }

  function onNextClick (e) {
    const step = +e.currentTarget.dataset.step;
    if (!canProceed(step)) return;
    goToStep(step + 1);
  }

  function onPrevClick (e) {
    const step = +e.currentTarget.dataset.step;
    goToStep(step - 1);
  }

  /* ───────────────────────────────────────────
     CARD TOGGLE (SELECTION LOGIC)
  ─────────────────────────────────────────── */
  function toggleCard (card) {
    const step      = +card.dataset.step;
    const isSingle  = card.dataset.single === 'true';
    const productId = card.dataset.productId;
    const isSelected= card.classList.contains('bb-card--selected');

    const selectEl  = card.querySelector('.bb-card__variant-select');
    const variantId = selectEl ? selectEl.value : null;
    const price     = selectEl
      ? (selectEl.tagName === 'SELECT'
          ? +selectEl.selectedOptions[0]?.dataset.price
          : +selectEl.dataset.price)
      : 0;
    const title     = card.querySelector('.bb-card__title')?.textContent.trim();
    const image     = card.querySelector('.bb-card__image')?.src || '';

    if (isSingle) {
      // Deselect any previously selected in this step
      $$('.bb-card--selected', wrapper)
        .filter(c => +c.dataset.step === step)
        .forEach(c => deselectCard(c));

      if (!isSelected) {
        selectCard(card);
        setSelection(step, { productId, variantId, title, price, image, step });
      } else {
        clearSelection(step);
      }
    } else {
      // Multi-select (extras)
      if (isSelected) {
        deselectCard(card);
        removeExtra(productId);
      } else {
        selectCard(card);
        addExtra({ productId, variantId, title, price, image, step });
      }
    }

    updateNextButton(step);
    updatePricingSummary();
  }

  function selectCard (card) {
    card.classList.add('bb-card--selected');
    card.setAttribute('aria-pressed', 'true');
  }

  function deselectCard (card) {
    card.classList.remove('bb-card--selected');
    card.setAttribute('aria-pressed', 'false');
  }

  /* ───────────────────────────────────────────
     STATE MUTATIONS
  ─────────────────────────────────────────── */
  function setSelection (step, data) {
    if (step === 1) state.selections.shirt = data;
    else if (step === 2) state.selections.accessory = data;
  }

  function clearSelection (step) {
    if (step === 1) state.selections.shirt = null;
    else if (step === 2) state.selections.accessory = null;
  }

  function addExtra (data) {
    state.selections.extras.push(data);
  }

  function removeExtra (productId) {
    state.selections.extras = state.selections.extras.filter(e => e.productId !== productId);
  }

  function updateSelectionVariant (step, productId, variantId, price) {
    if (step === 1 && state.selections.shirt?.productId === productId) {
      state.selections.shirt.variantId = variantId;
      state.selections.shirt.price = price;
    } else if (step === 2 && state.selections.accessory?.productId === productId) {
      state.selections.accessory.variantId = variantId;
      state.selections.accessory.price = price;
    } else {
      const extra = state.selections.extras.find(e => e.productId === productId);
      if (extra) { extra.variantId = variantId; extra.price = price; }
    }
  }

  function getAllSelections () {
    const items = [];
    if (state.selections.shirt) items.push({ ...state.selections.shirt, position: 'shirt' });
    if (state.selections.accessory) items.push({ ...state.selections.accessory, position: 'accessory' });
    state.selections.extras.forEach(e => items.push({ ...e, position: 'extra' }));
    return items;
  }

  /* ───────────────────────────────────────────
     PRICING ENGINE
  ─────────────────────────────────────────── */
  function calculatePricing () {
    const items     = getAllSelections();
    const count     = items.length;
    const subtotal  = items.reduce((s, i) => s + i.price, 0);

    // Determine tier
    const tiers = [...config.tiers].sort((a, b) => b.threshold - a.threshold);
    const activeTier = tiers.find(t => count >= t.threshold) || null;
    const discountPct = activeTier ? activeTier.discount : 0;
    const discountAmt = Math.floor(subtotal * discountPct / 100);
    const total = subtotal - discountAmt;

    // Next tier upsell
    const higherTiers = config.tiers
      .filter(t => t.threshold > count)
      .sort((a, b) => a.threshold - b.threshold);
    const nextTier = higherTiers[0] || null;
    const upsellMsg = nextTier
      ? `Add ${nextTier.threshold - count} more item${nextTier.threshold - count > 1 ? 's' : ''} to unlock ${nextTier.discount}% off`
      : count > 0 ? `You've unlocked the best discount!` : '';

    return { items, count, subtotal, discountPct, discountAmt, total, upsellMsg };
  }

  function formatMoney (cents) {
    return '$' + (cents / 100).toFixed(2);
  }

  /* ───────────────────────────────────────────
     PRICING UI UPDATE
  ─────────────────────────────────────────── */
  function updatePricingSummary () {
    const p = calculatePricing();

    // Update both desktop sidebar + mobile sheet
    ['', '-mobile'].forEach(suffix => {
      const itemsList    = $(`#bb-pricing-items${suffix}`) || $(`#bb-pricing-items`);
      const subtotalEl   = $(`#bb-subtotal${suffix}`);
      const discountRow  = $(`#bb-discount-row${suffix}`);
      const discountLbl  = $(`#bb-discount-label${suffix}`);
      const discountAmt  = $(`#bb-discount-amount${suffix}`);
      const totalEl      = $(`#bb-total${suffix}`);
      const upsellEl     = $(`#bb-upsell${suffix}`);

      if (!itemsList) return;

      // Items list
      if (p.items.length === 0) {
        itemsList.innerHTML = '<li class="bb-pricing__empty">No items selected yet.</li>';
      } else {
        itemsList.innerHTML = p.items.map(item => `
          <li class="bb-pricing__item">
            <img src="${item.image}" alt="${item.title}" class="bb-pricing__item-img" loading="lazy" width="48" height="48">
            <div class="bb-pricing__item-info">
              <span class="bb-pricing__item-title">${item.title}</span>
              <span class="bb-pricing__item-tag bb-pricing__item-tag--${item.position}">${item.position}</span>
            </div>
            <span class="bb-pricing__item-price">${formatMoney(item.price)}</span>
          </li>
        `).join('');
      }

      // Subtotal with count-up animation
      animateNumber(subtotalEl, p.subtotal);

      // Discount row
      if (p.discountPct > 0 && discountRow) {
        discountRow.classList.add('bb-pricing__discount-row--active');
        if (discountLbl) discountLbl.textContent = `${p.discountPct}% Bundle Discount`;
        if (discountAmt) { animateNumber(discountAmt, p.discountAmt, '-'); }
      } else if (discountRow) {
        discountRow.classList.remove('bb-pricing__discount-row--active');
      }

      // Total
      animateNumber(totalEl, p.total);

      // Upsell message
      if (upsellEl) upsellEl.textContent = p.upsellMsg;
    });

    // Mobile bar quick totals
    const mobCount = $('#bb-mob-count');
    const mobTotal = $('#bb-mob-total');
    if (mobCount) mobCount.textContent = p.count;
    if (mobTotal) mobTotal.textContent = formatMoney(p.total);
  }

  /* number count-up animation */
  function animateNumber (el, targetCents, prefix = '') {
    if (!el) return;
    const currentText = el.textContent.replace(/[^0-9]/g, '');
    const from = currentText ? +currentText : 0;
    const to   = targetCents;
    if (from === to) return;

    const dur  = 300;
    const start= performance.now();

    function tick (now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / dur, 1);
      const ease = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      const val = Math.round(from + (to - from) * ease);
      el.textContent = prefix + formatMoney(val);
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  /* ───────────────────────────────────────────
     STEP NAVIGATION
  ─────────────────────────────────────────── */
  function goToStep (target) {
    if (target < 1 || target > state.totalSteps) return;

    const direction = target > state.currentStep ? 'forward' : 'back';
    const fromStep  = stepEls.find(s => +s.dataset.step === state.currentStep);
    const toStep    = stepEls.find(s => +s.dataset.step === target);
    if (!toStep) return;

    // Slide transition
    if (fromStep) {
      fromStep.classList.add(direction === 'forward' ? 'bb-step--exit-left' : 'bb-step--exit-right');
      setTimeout(() => {
        fromStep.classList.add('bb-step--hidden');
        fromStep.classList.remove('bb-step--exit-left', 'bb-step--exit-right');
      }, 300);
    }

    toStep.classList.remove('bb-step--hidden');
    toStep.classList.add(direction === 'forward' ? 'bb-step--enter-right' : 'bb-step--enter-left');
    requestAnimationFrame(() => {
      toStep.classList.add('bb-step--active');
      setTimeout(() => toStep.classList.remove('bb-step--enter-right', 'bb-step--enter-left', 'bb-step--active'), 350);
    });

    state.currentStep = target;
    updateProgress();

    // Lazy load step data
    if (!state.loadedSteps.has(target)) {
      loadStepProducts(toStep, target);
    }

    // Populate review on last step
    if (target === state.totalSteps) {
      renderReview();
    }

    // Focus management
    toStep.querySelector('.bb-step__heading')?.focus();
  }

  function canProceed (step) {
    if (step === 1) return !!state.selections.shirt;
    if (step === 2) return !!state.selections.accessory;
    return true; // extras + review steps are optional
  }

  function updateNextButton (step) {
    const btn = $$(`.bb-btn--next[data-step="${step}"]`, wrapper)[0];
    if (!btn) return;
    const ok = canProceed(step);
    btn.disabled = !ok;
    btn.setAttribute('aria-disabled', !ok);
  }

  /* ───────────────────────────────────────────
     PROGRESS BAR
  ─────────────────────────────────────────── */
  function updateProgress () {
    progressSteps.forEach((el, i) => {
      const stepNum = i + 1;
      el.classList.toggle('bb-progress__step--active',    stepNum === state.currentStep);
      el.classList.toggle('bb-progress__step--completed', stepNum < state.currentStep);
    });
    progressLines.forEach((line, i) => {
      line.style.width = (i + 1) < state.currentStep ? '100%' : '0%';
    });
  }

  /* ───────────────────────────────────────────
     LAZY LOAD STEP PRODUCTS
  ─────────────────────────────────────────── */
  async function loadStepProducts (stepEl, stepNum) {
    const handle = stepEl.dataset.collection;
    const limit  = stepEl.dataset.limit || 6;
    if (!handle) return;

    const gridId = stepNum === 2 ? 'bb-accessories-grid' : 'bb-extras-grid';
    const grid   = $(`#${gridId}`, wrapper);
    if (!grid) return;

    grid.innerHTML = '<div class="bb-loader"><div class="bb-spinner" role="status" aria-label="Loading products"></div></div>';

    try {
      const res  = await fetch(`/collections/${handle}/products.json?limit=${limit}`);
      if (!res.ok) throw new Error('Network error');
      const data = await res.json();

      if (!data.products?.length) {
        grid.innerHTML = '<p class="bb-empty">No products found.</p>';
        return;
      }

      const isSingle = stepNum !== 3 || !config.enableExtras;
      grid.innerHTML  = data.products.map(p => renderProductCard(p, stepNum, isSingle || stepNum < 3)).join('');
      state.loadedSteps.add(stepNum);

      // Re-apply existing selections visually (back navigation)
      reapplySelections(grid, stepNum);

    } catch (err) {
      grid.innerHTML = `<p class="bb-empty bb-empty--error">Failed to load products. <button class="bb-retry" data-step="${stepNum}">Retry</button></p>`;
      grid.querySelector('.bb-retry')?.addEventListener('click', () => loadStepProducts(stepEl, stepNum));
    }
  }

  function renderProductCard (product, step, singleSelect) {
    const img       = product.images[0];
    const variant   = product.variants[0];
    const available = product.variants.some(v => v.available);
    const imgSrc    = img ? img.src.replace(/(\.[^.]*)$/, '_400x$1') : '';
   console.log(product.options[0].name);
    const variantOptions = product.variants.length > 1
      ? `<div class="bb-card__variants">
           <label class="bb-card__variants-label" for="variant-${product.id}">
             ${product.options[0].name }:
           </label>
           <select id="variant-${product.id}" class="bb-card__variant-select" data-product-id="${product.id}" aria-label="Select variant for ${product.title}">
             ${product.variants.map(v =>
               `<option value="${v.id}" data-price="${v.price_v2 ? v.price_v2.amount * 100 : v.price * 100}" ${!v.available ? 'disabled' : ''}>
                  ${v.title}${!v.available ? ' — Out of Stock' : ''}
                </option>`
             ).join('')}
           </select>
         </div>`
      : `<input type="hidden" class="bb-card__variant-select" data-product-id="${product.id}"
             value="${variant.id}" data-price="${variant.price_v2 ? variant.price_v2.amount * 100 : variant.price * 100}">`;

    return `
      <div class="bb-card${!available ? ' bb-card--oos' : ''}"
        data-product-id="${product.id}"
        data-step="${step}"
        data-single="${singleSelect}"
        data-product-handle="${product.handle}"
        role="button" tabindex="0"
        aria-pressed="false"
        aria-label="Select ${product.title}"
        ${!available ? 'aria-disabled="true"' : ''}
      >
        <div class="bb-card__image-wrap">
          ${imgSrc
            ? `<img class="bb-card__image" src="${imgSrc}" alt="${img.alt || product.title}" loading="lazy" width="400" height="400">`
            : `<div class="bb-card__image bb-card__image--placeholder"></div>`}
          <div class="bb-card__check-badge" aria-hidden="true">
            <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>
          </div>
          ${!available ? '<div class="bb-card__badge bb-card__badge--oos">Out of Stock</div>' : ''}
        </div>
        <div class="bb-card__info">
          <h3 class="bb-card__title">${product.title}</h3>
          <p class="bb-card__price" data-price="${variant.price}">${formatMoney(variant.price_v2 ? variant.price_v2.amount * 100 : variant.price * 100)}</p>
          ${variantOptions}
        </div>
      </div>`;
  }

  function reapplySelections (grid, step) {
    let toRestore = [];
    if (step === 2 && state.selections.accessory) toRestore = [state.selections.accessory];
    if (step === 3) toRestore = state.selections.extras;

    toRestore.forEach(sel => {
      const card = grid.querySelector(`[data-product-id="${sel.productId}"]`);
      if (card) {
        selectCard(card);
        // Restore variant
        const selectEl = card.querySelector('.bb-card__variant-select');
        if (selectEl && selectEl.tagName === 'SELECT') selectEl.value = sel.variantId;
      }
    });
  }

  /* ───────────────────────────────────────────
     REVIEW RENDER
  ─────────────────────────────────────────── */
  function renderReview () {
    const p = calculatePricing();

    if (p.items.length === 0) {
      reviewEl.innerHTML = '<p class="bb-review__empty">You haven\'t selected any items yet.</p>';
      return;
    }

    const rows = p.items.map(item => `
      <div class="bb-review__item">
        <img src="${item.image}" alt="${item.title}" class="bb-review__item-img" loading="lazy" width="72" height="72">
        <div class="bb-review__item-info">
          <h4 class="bb-review__item-title">${item.title}</h4>
          <span class="bb-review__item-tag bb-review__item-tag--${item.position}">${item.position}</span>
          <button class="bb-review__change" data-goto-step="${item.step}" aria-label="Change ${item.title}">Change</button>
        </div>
        <span class="bb-review__item-price">${formatMoney(item.price)}</span>
      </div>
    `).join('');

    reviewEl.innerHTML = `
      <div class="bb-review__items">${rows}</div>
      <div class="bb-review__totals">
        <div class="bb-review__row"><span>Subtotal</span><span>${formatMoney(p.subtotal)}</span></div>
        ${p.discountPct > 0
          ? `<div class="bb-review__row bb-review__row--discount">
               <span>${p.discountPct}% Bundle Discount</span>
               <span>-${formatMoney(p.discountAmt)}</span>
             </div>`
          : ''}
        <div class="bb-review__row bb-review__row--total">
          <span>Total</span><span>${formatMoney(p.total)}</span>
        </div>
        ${p.upsellMsg ? `<p class="bb-review__upsell">${p.upsellMsg}</p>` : ''}
      </div>
    `;

    // Bind "Change" buttons
    $$('.bb-review__change', reviewEl).forEach(btn => {
      btn.addEventListener('click', () => goToStep(+btn.dataset.gotoStep));
    });
  }

  /* ───────────────────────────────────────────
     ADD TO CART
  ─────────────────────────────────────────── */
  async function onAddToCart () {
    if (state.isSubmitting) return;
    const p = calculatePricing();
    if (p.items.length === 0) return;

    state.isSubmitting = true;
    setBtnState('loading');

    const bundleId = `bundle_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const items = p.items.map(item => ({
      id: +item.variantId,
      quantity: 1,
      properties: {
        _bundle_id: bundleId,
        _bundle_discount: `${p.discountPct}%`,
        _bundle_position: item.position,
        _bundle_title: item.title
      }
    }));

    try {
      const res = await fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items })
      });

      if (!res.ok) {
        const err = await res.json();
        // Check for out-of-stock errors
        if (err.description?.toLowerCase().includes('out of stock') ||
            err.description?.toLowerCase().includes('all .* have been sold')) {
          throw new Error('OUT_OF_STOCK:' + err.description);
        }
        throw new Error(err.description || 'Cart error');
      }

      setBtnState('success');

      // Apply discount code if configured
      if (p.discountPct > 0) await applyDiscount(p.discountPct);

      setTimeout(() => {
        showConfirmation(p, bundleId);
        state.isSubmitting = false;
      }, 800);

    } catch (err) {
      state.isSubmitting = false;
      setBtnState('error');

      if (err.message.startsWith('OUT_OF_STOCK:')) {
        showToast('Some items went out of stock. Please review your selections.', 'error');
        goToStep(state.currentStep - 1 || 1);
      } else if (err.name === 'TypeError') {
        // Network failure
        showToast('Network error. Please check your connection and try again.', 'error');
      } else {
        showToast(err.message || 'Something went wrong.', 'error');
      }

      setTimeout(() => setBtnState('idle'), 2000);
    }
  }

  async function applyDiscount (pct) {
    // Automatic discount codes strategy:
    // For Shopify Plus → use Shopify Scripts (managed outside JS)
    // For non-Plus → apply a pre-created automatic discount code
    // The discount code should be configured in Shopify Admin as BUNDLE10, BUNDLE15, BUNDLE20
    const codeMap = { 10: 'BUNDLE10', 15: 'BUNDLE15', 20: 'BUNDLE20' };
    const code = codeMap[pct];
    if (!code) return;

    try {
      await fetch('/discount/' + code, { method: 'GET' });
    } catch (_) { /* non-critical, discount application is best-effort here */ }
  }

  function setBtnState (state) {
    if (!atcBtn) return;
    atcBtn.dataset.state = state;
    atcBtn.disabled = state === 'loading' || state === 'success';
  }

  /* ───────────────────────────────────────────
     CONFIRMATION OVERLAY
  ─────────────────────────────────────────── */
  function showConfirmation (pricing, bundleId) {
    const summaryEl = $('#bb-confirmation-summary', confirmationEl);
    if (summaryEl) {
      summaryEl.innerHTML = `
        <p><strong>${pricing.items.length} items</strong> added to your cart.</p>
        ${pricing.discountPct > 0
          ? `<p class="bb-confirmation__savings">You saved <strong>${formatMoney(pricing.discountAmt)}</strong> (${pricing.discountPct}% off)</p>`
          : ''}
        <p class="bb-confirmation__total">Total: <strong>${formatMoney(pricing.total)}</strong></p>
      `;
    }
    confirmationEl.classList.add('bb-confirmation--visible');
    confirmationEl.setAttribute('aria-hidden', 'false');
    confirmationEl.querySelector('a')?.focus();
  }

  /* ───────────────────────────────────────────
     TOAST
  ─────────────────────────────────────────── */
  function showToast (msg, type = 'info') {
    let toast = $('#bb-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'bb-toast';
      toast.setAttribute('role', 'alert');
      toast.setAttribute('aria-live', 'assertive');
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.className = `bb-toast bb-toast--${type} bb-toast--visible`;
    setTimeout(() => toast.classList.remove('bb-toast--visible'), 4000);
  }

  /* ───────────────────────────────────────────
     MOBILE STICKY BAR SCROLL BEHAVIOUR
  ─────────────────────────────────────────── */
  function initMobileBarScroll () {
    const bar = $('#bb-mobile-bar');
    if (!bar) return;

    let lastScrollY = window.scrollY;
    let ticking = false;

    window.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const currentY  = window.scrollY;
          const scrollingDown = currentY > lastScrollY + 5;
          bar.classList.toggle('bb-mobile-bar--hidden', scrollingDown);
          lastScrollY = currentY;
          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true });
  }

  /* ───────────────────────────────────────────
     BOOTSTRAP
  ─────────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
