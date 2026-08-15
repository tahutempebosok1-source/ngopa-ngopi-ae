module.exports = (req, res) => {
    const products = [
        // --- KOPI KENANGAN ---
        { id: 101, brand: 'Kopi Kenangan', name: 'Kopi Kenangan Mantan', cat: 'Kopi', price: 19000, img: 'kopi-kenangan-mantan.png', desc: 'Espresso, susu segar, dan gula aren asli' },
        { id: 102, brand: 'Kopi Kenangan', name: 'Americano', cat: 'Kopi', price: 15000, img: 'americano.png', desc: 'Espresso kaya rasa dipadu air mineral segar' },
        { id: 103, brand: 'Kopi Kenangan', name: 'Avocado Coffee', cat: 'Kopi', price: 24000, img: 'avocado-coffee.png', desc: 'Perpaduan kopi mantap dengan alpukat gurih' },
        { id: 104, brand: 'Kopi Kenangan', name: 'Dutch Chocolate', cat: 'Non-Kopi', price: 20000, img: 'dutch-chocolate.png', desc: 'Cokelat pekat khas Belanda' },
        { id: 105, brand: 'Kopi Kenangan', name: 'Chocolate Croissant', cat: 'Jajanan', price: 15000, img: 'chocolate-croissant.png', desc: 'Pastry renyah isi cokelat' },
        { id: 106, brand: 'Kopi Kenangan', name: 'Chocolate Donut', cat: 'Jajanan', price: 12000, img: 'chocolate-donut.png', desc: 'Donat balut cokelat tebal' },
        { id: 107, brand: 'Kopi Kenangan', name: 'Roti Coklat Klasik', cat: 'Jajanan', price: 12000, img: 'roti-coklat-klasik.png', desc: 'Roti isi pasta cokelat lembut' },
        { id: 123, brand: 'Kopi Kenangan', name: 'Paket Hemat 1', cat: 'Paket Hemat', price: 30000, img: 'pahe-1.png', desc: 'Americano dengan Chocolate Croissant / Chocolate Donut', slotCount: 2 },
        { id: 124, brand: 'Kopi Kenangan', name: 'Paket Hemat 2', cat: 'Paket Hemat', price: 31000, img: 'pahe-2.png', desc: 'Kopi Kenangan Mantan + Roti Coklat Klasik', slotCount: 2 },
        { id: 125, brand: 'Kopi Kenangan', name: 'Paket Hemat 3', cat: 'Paket Hemat', price: 32000, img: 'pahe-3.png', desc: 'Dutch Chocolate dengan Roti Coklat / Croissant / Donut', slotCount: 2 },

        // --- FORE COFFEE ---
        { id: 201, brand: 'Fore Coffee', name: 'Fore Pandan Latte', cat: 'Kopi', price: 29000, img: 'fore-pandan-latte.png', desc: 'Espresso dengan sirup pandan' },
        { id: 202, brand: 'Fore Coffee', name: 'Butterscotch Sea Salt Latte', cat: 'Kopi', price: 31000, img: 'fore-butterscotch.png', desc: 'Espresso creamy rasa butterscotch' },
        { id: 203, brand: 'Fore Coffee', name: 'Americano', cat: 'Kopi', price: 21000, img: 'fore-americano.png', desc: 'Dua shot espresso dan air mineral' },
        { id: 204, brand: 'Fore Coffee', name: 'Butter Croissant', cat: 'Jajanan', price: 22000, img: 'fore-butter-croissant.png', desc: 'Croissant renyah beraroma butter' }
    ];

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.status(200).json(products);
};