// Fair market value guide for commonly donated goods.
// Every range carries a source tag (4th element), see FMV_SOURCES below:
//   SA     Salvation Army Donation Value Guide
//   GW     Goodwill Industries International valuation guide (Orange County Goodwill edition, 2023)
//   SA+GW  listed by both; the range spans the lower low and the higher high of the two
//   EST    neither guide lists the item; DeductBook estimate from typical thrift-store resale prices
// Checked line by line against both guides on 28 September 2026. FMV is what a willing buyer would
// pay a willing seller for the item in its current condition, not what you paid (IRS Publication 561).
window.FMV_SOURCES = {
  SA: { short: "Salvation Army", name: "Salvation Army Donation Value Guide", url: "https://satruck.org/Home/DonationValueGuide", checked: "2026-09-28" },
  GW: { short: "Goodwill", name: "Goodwill Industries International valuation guide (Orange County Goodwill, 2023 edition)", url: "https://www.ocgoodwill.org/wp-content/uploads/2024/01/Valuation-Guide-2023.pdf", checked: "2026-09-28" },
  "SA+GW": { short: "Salvation Army + Goodwill", name: "Listed in both the Salvation Army and Goodwill guides; the range spans both", checked: "2026-09-28" },
  EST: { short: "DeductBook estimate", name: "Not listed in either charity guide; DeductBook estimate from typical thrift-store resale prices. Prefer comparable sales for anything valuable.", checked: "2026-09-28" }
};
window.FMV_GUIDE = [
  { cat: "Women's clothing", items: [
    ["Blouse / top", 2, 12, "SA+GW"], ["Dress", 3, 20, "SA+GW"], ["Skirt", 2, 12, "SA+GW"], ["Pants / slacks", 2, 12, "SA+GW"], ["Jeans", 4, 21, "GW"],
    ["Sweater", 4, 16, "SA+GW"], ["Suit (2-piece)", 5, 30, "SA+GW"], ["Pants suit", 7, 26, "SA"], ["Coat / overcoat", 7, 41, "SA+GW"], ["Jacket / blazer", 4, 12, "SA+GW"],
    ["Shoes (pair)", 2, 26, "SA+GW"], ["Boots (pair)", 2, 18, "SA+GW"], ["Handbag / purse", 2, 21, "SA+GW"], ["Evening dress / formal", 10, 62, "SA+GW"], ["Swimsuit", 4, 12, "SA+GW"],
    ["Nightgown / robe", 2, 12, "SA+GW"], ["Hat", 1, 8, "SA"] ] },
  { cat: "Men's clothing", items: [
    ["Shirt (dress or casual)", 2, 12, "SA+GW"], ["T-shirt", 1, 6, "GW"], ["Pants / slacks", 2, 15, "SA+GW"], ["Jeans", 4, 21, "GW"], ["Shorts", 1, 10, "SA+GW"],
    ["Sweater", 3, 15, "SA+GW"], ["Suit (2-piece)", 10, 62, "SA+GW"], ["Tuxedo", 10, 62, "SA"], ["Sport coat / blazer", 6, 12, "GW"], ["Overcoat", 16, 62, "SA"],
    ["Jacket", 8, 26, "SA"], ["Raincoat", 5, 21, "SA"], ["Shoes (pair)", 4, 26, "SA+GW"], ["Boots (pair)", 6, 18, "GW"], ["Pajamas", 2, 10, "SA+GW"],
    ["Tie", 1, 5, "EST"], ["Belt", 2, 15, "GW"] ] },
  { cat: "Children's clothing", items: [
    ["Shirt / top", 1, 6, "SA+GW"], ["Pants / jeans", 1, 12, "SA+GW"], ["Dress", 2, 12, "SA+GW"], ["Sweater", 1, 8, "SA+GW"], ["Coat", 3, 21, "SA+GW"],
    ["Snowsuit", 4, 20, "SA"], ["Shoes (pair)", 2, 9, "SA+GW"], ["Boots (pair)", 2, 21, "SA+GW"], ["Pajamas", 1, 6, "GW"], ["Baby clothing (per piece)", 1, 4, "EST"] ] },
  { cat: "Furniture", items: [
    ["Sofa / couch", 30, 207, "SA+GW"], ["Sleeper sofa (with mattress)", 88, 311, "SA"], ["Loveseat", 25, 100, "EST"], ["Upholstered chair", 26, 104, "SA"], ["Recliner", 25, 120, "EST"],
    ["Coffee table", 10, 67, "SA+GW"], ["End table", 4, 52, "SA+GW"], ["Dining table", 35, 135, "EST"], ["Dining chair (each)", 3, 15, "SA+GW"], ["Kitchen / dinette set", 36, 176, "SA+GW"],
    ["Dining room set (complete)", 156, 934, "SA"], ["China cabinet", 89, 311, "SA"], ["Bed frame + headboard (full/queen/king)", 52, 176, "SA"], ["Bed frame (single)", 36, 104, "SA"], ["Mattress & box spring (clean)", 13, 78, "SA"],
    ["Bedroom set (complete)", 259, 1037, "SA"], ["Dresser / chest of drawers", 20, 104, "SA+GW"], ["Wardrobe / clothes closet", 16, 104, "SA"], ["Nightstand", 10, 40, "EST"], ["Desk", 26, 145, "SA+GW"],
    ["Bookcase", 15, 75, "EST"], ["Floor lamp", 4, 52, "SA+GW"], ["Table lamp", 4, 78, "SA+GW"], ["Rug (area, 5x8 or larger)", 21, 93, "SA"], ["Entertainment center / TV stand", 20, 100, "EST"],
    ["Crib (must meet current safety standards)", 26, 104, "SA"], ["High chair", 10, 52, "SA"], ["Playpen", 4, 31, "SA"], ["Patio set", 25, 150, "EST"] ] },
  { cat: "Appliances", items: [
    ["Refrigerator (working)", 78, 259, "SA"], ["Freezer", 25, 100, "SA"], ["Range / stove", 52, 156, "SA"], ["Washing machine", 41, 156, "SA"], ["Dryer", 47, 93, "SA"],
    ["Dishwasher", 30, 125, "EST"], ["Microwave", 10, 50, "SA"], ["Window air conditioner", 21, 93, "SA"], ["Vacuum cleaner", 16, 67, "SA"], ["Space heater", 8, 23, "SA"],
    ["Toaster / small kitchen appliance", 3, 15, "EST"], ["Coffee maker", 4, 16, "SA+GW"], ["Blender / mixer", 5, 21, "SA"], ["Griddle", 4, 12, "SA+GW"], ["Sewing machine", 15, 88, "SA"] ] },
  { cat: "Electronics", items: [
    ["Flat-screen TV (working)", 78, 233, "SA"], ["Laptop (working, recent)", 50, 300, "EST"], ["Desktop computer (system)", 50, 415, "SA+GW"], ["Computer monitor", 5, 51, "SA+GW"], ["Printer", 5, 155, "SA+GW"],
    ["Tablet", 25, 150, "SA"], ["eReader", 10, 50, "SA"], ["Smartphone (unlocked, working)", 25, 100, "SA"], ["Stereo / speaker system", 16, 78, "SA"], ["DVD / Blu-ray player", 8, 16, "SA+GW"],
    ["Video game console", 20, 120, "EST"], ["Camera (digital)", 15, 100, "EST"], ["Radio / clock radio", 2, 52, "SA+GW"] ] },
  { cat: "Sporting goods & outdoor", items: [
    ["Adult bicycle", 5, 83, "SA"], ["Child bicycle", 5, 30, "EST"], ["Golf clubs (full set with bag)", 25, 120, "EST"], ["Golf club (single)", 2, 26, "SA+GW"], ["Tennis racket", 2, 5, "SA+GW"],
    ["Ice skates (pair)", 3, 16, "SA+GW"], ["Roller blades (pair)", 3, 16, "SA+GW"], ["Skis with bindings (pair)", 10, 60, "EST"], ["Snowboard", 15, 60, "EST"], ["Treadmill (working)", 50, 200, "EST"],
    ["Exercise bike", 20, 90, "EST"], ["Weight set", 10, 50, "EST"], ["Camping tent", 10, 60, "EST"], ["Sleeping bag", 5, 25, "EST"], ["Fishing rod & reel", 5, 30, "EST"], ["Kayak / canoe", 50, 250, "EST"] ] },
  { cat: "Household & kitchen", items: [
    ["Blanket / comforter", 2, 16, "SA+GW"], ["Bedspread / quilt", 3, 25, "SA+GW"], ["Sheet set", 2, 8, "SA+GW"], ["Pillow", 2, 8, "SA"], ["Towel (bath)", 0.5, 4, "SA"],
    ["Curtains / drapes (pair)", 2, 41, "SA"], ["Dish set (service for 4+)", 10, 30, "EST"], ["Plate (each)", 0.5, 3, "SA+GW"], ["Glassware (each)", 0.5, 2, "SA+GW"], ["Pot or pan (each)", 1, 3, "SA+GW"],
    ["Cookware set (pots & pans)", 5, 30, "EST"], ["Bakeware (each)", 1, 3, "SA+GW"], ["Kitchen utensils (each)", 0.5, 2, "SA+GW"], ["Small decor / vase / picture frame", 1, 10, "EST"], ["Framed art / print / painting", 5, 207, "SA"],
    ["Christmas / holiday decor (box)", 3, 20, "EST"], ["Luggage (suitcase)", 5, 16, "SA+GW"], ["Umbrella", 2, 6, "SA+GW"], ["Tools (hand tool, each)", 1, 8, "EST"], ["Power tool (working)", 10, 60, "EST"],
    ["Lawn mower (working)", 26, 104, "SA"], ["Lawn mower (riding)", 104, 311, "SA"] ] },
  { cat: "Books, media & toys", items: [
    ["Hardcover book", 1, 3, "SA+GW"], ["Paperback book", 0.75, 2, "SA+GW"], ["Textbook (recent edition)", 2, 15, "EST"], ["Children's book", 0.5, 2, "EST"], ["DVD / Blu-ray", 2, 5, "SA+GW"],
    ["CD", 2, 5, "SA+GW"], ["Vinyl record", 1, 1, "GW"], ["Video game", 2, 15, "EST"], ["Board game (complete)", 1, 3, "SA+GW"], ["Puzzle (complete)", 0.5, 0.5, "GW"],
    ["Stuffed animal", 0.5, 1, "SA+GW"], ["Toy (small)", 0.5, 3, "EST"], ["Toy (large, ride-on or playset)", 5, 40, "EST"], ["Doll / action figure", 1, 5, "EST"], ["Stroller / carriage", 5, 100, "SA"],
    ["Car seat (unexpired, never in a crash)", 10, 40, "EST"] ] }
];

window.FMV_CONDITIONS = [
  ["excellent", "Excellent — like new", 1.0],
  ["good", "Good — normal wear, fully usable", 0.6],
  ["fair", "Fair — visibly worn (generally NOT deductible for clothing & household items)", 0.25]
];

window.FMV_METHODS = [
  "Thrift-store / charity valuation guide",
  "Comparable sales (eBay, Facebook Marketplace, Craigslist)",
  "Charity's own price list",
  "Qualified appraisal",
  "Catalog / dealer price for used items",
  "Other (describe in notes)"
];

// Appraisal groups: "similar items" for the IRS $5,000 aggregation test are grouped by kind of
// property, not by the shopping category above. Guide category → group.
window.FMV_GROUPS = {
  "Women's clothing": "Clothing", "Men's clothing": "Clothing", "Children's clothing": "Clothing",
  "Furniture": "Furniture", "Appliances": "Appliances", "Electronics": "Electronics",
  "Sporting goods & outdoor": "Sporting goods", "Household & kitchen": "Household items",
  "Books, media & toys": "Toys & games",   // default for the mixed category; keywords below split it
  "Art & collectibles": "Art & collectibles", "Jewelry & watches": "Jewelry", "Vehicles": "Vehicles", "Other": "Other"
};
// Keyword overrides checked against the item description, first match wins.
window.FMV_GROUP_KEYWORDS = [
  [/\b(book|textbook|paperback|hardcover|novel|encyclopedia)s?\b/, "Books"],
  [/\b(dvd|blu-?ray|cd|vinyl|record|video game|cassette)s?\b/, "Media"],
  [/\b(painting|print|sculpture|artwork|antique|collectible|coin|stamp)s?\b/, "Art & collectibles"],
  [/\b(ring|necklace|bracelet|earring|watch|jewel)s?\b/, "Jewelry"],
  [/\b(car|truck|suv|van|boat|trailer|motorcycle|airplane)\b(?! seat)/, "Vehicles"]
];
// Extra categories offered on the item row that have no guide values (appraisal-relevant property).
window.FMV_EXTRA_CATEGORIES = ["Art & collectibles", "Jewelry & watches", "Vehicles"];
