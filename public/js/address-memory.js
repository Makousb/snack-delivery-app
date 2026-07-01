const DELIVERY_ADDRESS_KEY = "snack.deliveryAddress";

const getSavedAddress = () => {
  try {
    return localStorage.getItem(DELIVERY_ADDRESS_KEY) || "";
  } catch {
    return "";
  }
};

const saveAddress = (value) => {
  try {
    localStorage.setItem(DELIVERY_ADDRESS_KEY, value.trim());
  } catch {
    // Keep address entry usable even when storage is unavailable.
  }
};

const clearAddress = () => {
  try {
    localStorage.removeItem(DELIVERY_ADDRESS_KEY);
  } catch {
    // Keep address entry usable even when storage is unavailable.
  }
};

// Notify the page (e.g. the cart's live delivery quote) that the customer's
// delivery coordinates changed. lat/lng are null when they can't be resolved.
const emitCoordsChanged = (form, lat, lng) => {
  if (!form) return;
  form.dispatchEvent(
    new CustomEvent("snack:delivery-coords", {
      detail: { lat: lat != null ? Number(lat) : null, lng: lng != null ? Number(lng) : null }
    })
  );
};

document.addEventListener("DOMContentLoaded", () => {
  const addressInputs = document.querySelectorAll("[data-delivery-address-input]");
  const statusMessages = document.querySelectorAll("[data-delivery-address-status]");
  const saveButtons = document.querySelectorAll("[data-delivery-address-save]");
  const clearButtons = document.querySelectorAll("[data-delivery-address-clear]");
  const checkoutInput = document.querySelector("[data-checkout-address]");
  const navAddress = document.querySelector("[data-nav-delivery-address]");

  const syncNavAddress = (value) => {
    if (!navAddress) return;
    navAddress.textContent = value.trim() || "Set your address";
  };

  let statusTimeoutId = null;

  const syncStatus = (value) => {
    if (statusTimeoutId) clearTimeout(statusTimeoutId);

    statusMessages.forEach((status) => {
      status.textContent = value.trim() ? "Saved ✓" : "";
    });

    if (value.trim()) {
      statusTimeoutId = setTimeout(() => {
        statusMessages.forEach((status) => {
          status.textContent = "";
        });
      }, 2000);
    }
  };

  const syncClearButtons = (value) => {
    clearButtons.forEach((button) => {
      button.style.opacity = value.trim() ? "1" : "0.62";
      button.style.pointerEvents = value.trim() ? "auto" : "none";
    });
  };

  const syncInputs = (value, sourceInput) => {
    addressInputs.forEach((input) => {
      if (input !== sourceInput) {
        input.value = value;
      }
    });

    if (checkoutInput && checkoutInput !== sourceInput) {
      checkoutInput.value = value;
    }
  };

  const commitAddress = (value, sourceInput) => {
    saveAddress(value);
    syncInputs(value, sourceInput);
    syncStatus(value);
    syncNavAddress(value);
    syncClearButtons(value);
  };

  const savedAddress = getSavedAddress();

  syncInputs(savedAddress);
  syncStatus(savedAddress);
  syncNavAddress(savedAddress);
  syncClearButtons(savedAddress);

  addressInputs.forEach((input) => {
    input.value = savedAddress;

    input.addEventListener("input", () => {
      commitAddress(input.value, input);
    });

    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        commitAddress(input.value, input);
        input.blur();
      }

      if (event.key === "Escape") {
        input.value = "";
        clearAddress();
        syncInputs("", input);
        syncStatus("");
        syncNavAddress("");
        syncClearButtons("");
      }
    });
  });

  if (checkoutInput) {
    checkoutInput.value = savedAddress;
  }

  saveButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const scopedInput =
        button.closest(".delivery-address-form")?.querySelector("[data-delivery-address-input]") ||
        addressInputs[0];

      if (!scopedInput) return;
      commitAddress(scopedInput.value, scopedInput);
    });
  });

  clearButtons.forEach((button) => {
    button.addEventListener("click", () => {
      clearAddress();
      syncInputs("");
      syncStatus("");
      syncNavAddress("");
      syncClearButtons("");
      addressInputs[0]?.focus();
    });
  });

  document.querySelectorAll("[data-capture-location]").forEach((button) => {
    const form = button.closest("form");
    const statusEl = form?.querySelector("[data-location-status]");
    const latInput = form?.querySelector('[name="deliveryLat"]');
    const lngInput = form?.querySelector('[name="deliveryLng"]');

    if (!form || !latInput || !lngInput) return;

    if (!("geolocation" in navigator)) {
      button.disabled = true;
      if (statusEl) statusEl.textContent = "Location isn't available in this browser.";
      return;
    }

    button.addEventListener("click", () => {
      if (statusEl) statusEl.textContent = "Getting your location...";

      navigator.geolocation.getCurrentPosition(
        (position) => {
          latInput.value = position.coords.latitude;
          lngInput.value = position.coords.longitude;
          if (statusEl) statusEl.textContent = "Location captured — your rider will get exact coordinates.";
          emitCoordsChanged(form, position.coords.latitude, position.coords.longitude);
        },
        () => {
          latInput.value = "";
          lngInput.value = "";
          if (statusEl) {
            statusEl.textContent = "Couldn't get your location. The address above will be used instead.";
          }
          emitCoordsChanged(form, null, null);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  });

  // Real address recognition via Google Places, when a Maps API key is
  // configured. Stays a plain text field otherwise -- nothing here breaks
  // without it.
  function initPlacesAutocomplete() {
    if (!window.google?.maps?.places) return;

    addressInputs.forEach((input) => {
      const autocomplete = new google.maps.places.Autocomplete(input, {
        fields: ["formatted_address", "geometry"],
        componentRestrictions: { country: "ke" }
      });

      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        const address = place.formatted_address || input.value;

        input.value = address;
        commitAddress(address, input);

        const lat = place.geometry?.location?.lat();
        const lng = place.geometry?.location?.lng();

        if (typeof lat === "number" && typeof lng === "number") {
          const form = input.closest("form");
          const latInput = form?.querySelector('[name="deliveryLat"]');
          const lngInput = form?.querySelector('[name="deliveryLng"]');

          if (latInput) latInput.value = lat;
          if (lngInput) lngInput.value = lng;
          emitCoordsChanged(input.closest("form"), lat, lng);
        }
      });
    });
  }

  if (window.__googleMapsReady) {
    initPlacesAutocomplete();
  } else {
    document.addEventListener("google-maps-ready", initPlacesAutocomplete);
  }
});
