export function requireAuth(req, res, next) {
  if (!req.session.user) {
    req.flash("error", "Please log in first");
    return res.redirect("/auth/login");
  }

  // 🔥 Attach user to request (VERY IMPORTANT)
  req.user = req.session.user;

  next();
}


export function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== "admin") {
    req.flash("error", "Access denied");
    return res.redirect("/auth/login");
  }

  // 🔥 Also attach user here
  req.user = req.session.user;

  next();
}

export function requireRole(role) {
  return (req, res, next) => {
    const allowedRoles = Array.isArray(role) ? role : [role];

    if (!req.session.user) {
      req.flash("error", "Please log in first");
      return res.redirect("/auth/login");
    }

    if (!allowedRoles.includes(req.session.user.role)) {
      req.flash("error", "Access denied");
      return res.redirect("/auth/login");
    }

    req.user = req.session.user;
    next();
  };
}
