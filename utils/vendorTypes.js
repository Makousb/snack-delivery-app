export const VENDOR_TYPES = [
  { value: "restaurant", label: "Restaurant" },
  { value: "store", label: "Store" },
  { value: "street_vendor", label: "Street Vendor" },
  { value: "service_provider", label: "Service Provider" }
];

export const VENDOR_TYPE_VALUES = VENDOR_TYPES.map((type) => type.value);

// Starting suggestions for the service_category free-text field — a
// datalist, not an enum, so a provider can type any trade ("Pool
// Maintenance") that isn't in this list.
export const SERVICE_CATEGORY_SUGGESTIONS = [
  "Plumbing",
  "Roofing",
  "Cleaning",
  "Catering",
  "Personal Chef",
  "Electrical",
  "Painting",
  "Landscaping",
  "Moving & Hauling",
  "Appliance Repair",
  "Pest Control",
  "Laundry"
];
