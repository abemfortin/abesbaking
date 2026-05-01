/**
 * products.js — Abe's Baking menu config
 *
 * Edit this file each week to update your menu.
 * Each item appears as a card on the site. Set inStock: false to grey it out
 * and show a "Sold Out" badge instead of the order button.
 *
 * Fields:
 *   name        — shown on the card
 *   description — 1–3 sentences
 *   price       — price string shown on the card
 *   stripeLink  — your Stripe payment link URL for this item
 *   inStock     — true or false
 *   imageUrl    — (optional) link to a product photo; leave as "" for the default placeholder
 */

const shopClosed = false;

const products = [
  {
    name: "Country Sourdough Boule",
    description: "A naturally leavened country loaf with a crackly, blistered crust and a tangy open crumb. Cold-fermented for 24 hours. Approximately 1 lb.",
    price: "$6.99",
    stripeLink: "https://buy.stripe.com/your-link-here",
    inStock: true,
    imageUrl: ""
  },
  {
    name: "Brown Butter Chocolate Chip Cookies",
    description: "Thick bakery-style cookies made with browned butter, dark chocolate chunks, and a finishing sprinkle of flaky sea salt. Half-dozen per order.",
    price: "$6.99",
    stripeLink: "https://buy.stripe.com/your-link-here",
    inStock: false,
    imageUrl: ""
  }
];
