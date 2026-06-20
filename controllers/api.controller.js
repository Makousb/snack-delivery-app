import { getAllMenuItems } from "../db/queries/menu.js";

export async function getMenuAPI(req, res) {
  try {
    const { category, search, page = 1 } = req.query;

    const items = await getAllMenuItems();

    let filtered = items;

    if (category) {
      filtered = filtered.filter(item => {
        if (!item.category) return false;
        return item.category.toLowerCase() === category.toLowerCase();
      });
    }

    if (search) {
      filtered = filtered.filter(item => {
        if (!item.name) return false;
        return item.name.toLowerCase().includes(search.toLowerCase());
      });
    }

    const limit = 6;
    const currentPage = Number(page);

    const start = (currentPage - 1) * limit;
    const end = start + limit;

    const paginated = filtered.slice(start, end);

    res.json({
      page: currentPage,
      totalItems: filtered.length,
      totalPages: Math.ceil(filtered.length / limit),
      data: paginated
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Server error"
    });
  }
}