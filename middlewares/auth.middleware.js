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
