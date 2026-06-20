export function notFound(req, res) {
  res.status(404).render("404", {
    title: "Page Not Found"
  });
}

export function handleError(err, req, res, next) {
  console.error(err);

  if (res.headersSent) {
    return next(err);
  }

  return res.status(500).render("500", {
    title: "Server Error"
  });
}
