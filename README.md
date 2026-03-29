# 🛍️ Bundle Builder — Shopify Theme Feature

A custom multi-step bundle builder section for Shopify themes that allows customers to build a product bundle (Shirt + Accessory + Extras) and automatically receive a tiered discount at checkout.

***

## 📦 Features

- 4-step guided bundle selection (Shirt → Accessory → Extras → Review)
- Collection-based product loading via Storefront Ajax API
- Tiered automatic discount applied at checkout (no code entry required)
- Live pricing sidebar with count-up animation
- Upsell messaging to nudge customers to the next discount tier
- Mobile sticky bar with slide-up sheet summary
- Variant selection support per product
- Out-of-stock handling with badge + disabled state
- Back navigation with selection persistence
- Accessible (ARIA roles, keyboard navigation, focus management)
- Toast notifications for cart errors

***

## 🎯 Discount Tiers

| Items Selected | Requirement | Discount |
|---|---|---|
| 2 items | 1 Shirt + 1 Accessory (required) | 10% off |
| 3–4 items | Shirt + Accessory + 1–2 Extras | 15% off |
| 5+ items | Shirt + Accessory + 3+ Extras | 20% off |

> **Important:** At least 1 shirt AND 1 accessory must be present in the bundle for any discount to apply.
> The discount is applied automatically at checkout — the customer never needs to manually enter a code.

***

## 🗂️ File Structure

```
theme/
├── templates/
│   └── page.bundle-builder.liquid       # Page template 
├── sections/
│   └── bundle-builder.liquid       # Section template + schema settings
├── assets/
│   ├── bundle-builder.js           # Core JS logic (state, pricing, cart)
│   └── bundle-builder.css          # All styles (steps, cards, pricing, mobile)
└── snippets/
    └── bundle-product-card.liquid     # For product card rendering    
    └── bundle-pricing-panel.liquid     # For right side price panel   
```

***

### 1. Configure Section Settings in Theme Editor

In **Shopify Admin → Online Store → Customize**, select the Bundle Builder section and configure:

| Setting | Description | Example Value |
|---|---|---|
| Shirts Collection | Collection handle for shirts | `shirts` |
| Accessories Collection | Collection handle for accessories | `accessories` |
| Extras Collection | Collection handle for extras | `extras` |
| Enable Extras Step | Toggle Step 3 (extras) on/off | `true` |
| Tier 1 Threshold | Min items to trigger tier 1 | `2` |
| Tier 1 Discount | Discount % for tier 1 | `10` |
| Tier 2 Threshold | Min items to trigger tier 2 | `3` |
| Tier 2 Discount | Discount % for tier 2 | `15` |
| Tier 3 Threshold | Min items to trigger tier 3 | `5` |
| Tier 3 Discount | Discount % for tier 3 | `20` |

These values are read from `data-*` attributes on the `#bundle-builder` wrapper element in the section Liquid file.

***

## 🏷️ Discount Code Setup in Shopify Admin

Go to **Shopify Admin → Discounts → Create Discount → Amount off order**.

Create the following 3 codes:

### BUNDLE10 — 10% off (2 items)

| Field | Value |
|---|---|
| Method | Discount code |
| Code | `BUNDLE10` |
| Discount value | 10% |
| Applies to | Based on collections selected |
| Minimum requirements | Minimum quantity of items → **2** |
| Customer eligibility | All customers |
| Usage limit per customer | 1 |
| Combine with other discounts | OFF |
| End date | None |

### BUNDLE15 — 15% off (3–4 items)

| Field | Value |
|---|---|
| Code | `BUNDLE15` |
| Discount value | 15% |
| Minimum quantity | **3** |
| All other settings | Same as BUNDLE10 |

### BUNDLE20 — 20% off (5+ items)

| Field | Value |
|---|---|
| Code | `BUNDLE20` |
| Discount value | 20% |
| Minimum quantity | **5** |
| All other settings | Same as BUNDLE10 |


## 🧩 How It Works — Step by Step

1. Customer visits the bundle builder page
2. **Step 1 — Shirt** → Single select, required to proceed
3. **Step 2 — Accessory** → Single select, required to proceed (lazy-loaded via Ajax)
4. **Step 3 — Extras** → Multi-select, optional (lazy-loaded via Ajax)
5. **Step 4 — Review** → Full summary with live pricing + discount breakdown
6. Customer clicks **Add Bundle to Cart** → All items added via `/cart/add.js` with line item properties
7. Shopify auto-applies the discount code at checkout — no customer action needed
