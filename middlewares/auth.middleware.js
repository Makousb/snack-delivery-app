function getSessionUser(req) {
  return req.session?.user || null;
}

export function requireAuth(req, res, next) {
  const user = getSessionUser(req);

  if (!user) {
    req.flash("error", "Please log in first");
    return res.redirect("/auth/login");
  }

  req.user = user;
  return next();
}

export function requireAdmin(req, res, next) {
  const user = getSessionUser(req);

  if (!user || user.role !== "admin") {
    req.flash("error", "Access denied");
    return res.redirect("/auth/login");
  }

  req.user = user;
  return next();
}

export function requireRole(role) {
  const allowedRoles = Array.isArray(role) ? role : [role];

  return (req, res, next) => {
    const user = getSessionUser(req);

    if (!user) {
      req.flash("error", "Please log in first");
      return res.redirect("/auth/login");
    }

    if (!allowedRoles.includes(user.role)) {
      req.flash("error", "Access denied");
      return res.redirect("/auth/login");
    }

    req.user = user;
    return next();
  };
}

// Keeps customer-only features (cart, checkout, order history) separate from
// the vendor/driver sides. Guests and customers pass through untouched —
// only a logged-in owner/admin/driver account gets redirected to its own hub.
export function blockRoles(roles) {
  const blockedRoles = Array.isArray(roles) ? roles : [roles];

  return (req, res, next) => {
    const user = getSessionUser(req);

    if (user && blockedRoles.includes(user.role)) {
      req.flash("error", "That's a customer feature — use your hub instead.");
      return res.redirect(user.role === "driver" ? "/driver" : "/admin");
    }

    return next();
  };
}
