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

  const syncStatus = (value) => {
    statusMessages.forEach((status) => {
      status.textContent = value.trim()
        ? `Saved address: ${value.trim()}`
        : "No saved address yet.";
    });
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
        },
        () => {
          latInput.value = "";
          lngInput.value = "";
          if (statusEl) {
            statusEl.textContent = "Couldn't get your location. The address above will be used instead.";
          }
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  });
});
