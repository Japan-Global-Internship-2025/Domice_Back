const getSortOption = (req, defaultColumn = "created_at") => {
    const { sort } = req.query;
    if (sort === "oldest") return { column: defaultColumn, ascending: true };
    return { column: defaultColumn, ascending: false }; // 기본: 최신순
};

export { getSortOption };