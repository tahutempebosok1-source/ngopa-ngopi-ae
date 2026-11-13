// ======================== STATE & DINAMIS CONFIG DARI SUPABASE ========================
let BUNDLING_PRESETS = {};
let premiumOutletIds = [];
let LOYALTY_LEVELS = [
    { minOrders: 0, level: 'Anak Baru Ngopi', icon: '🌱', desc: 'Baru coba', voucher: null, discount: 0 },
    { minOrders: 10, level: 'Ngopers Amatir', icon: '🐣', desc: 'Mulai sering', voucher: 'Diskon Rp200/transaksi', discount: 200 },
    { minOrders: 20, level: 'Ngopers Addict', icon: '🔥', desc: 'Udah langganan', voucher: 'Diskon Rp400/transaksi', discount: 400 },
    { minOrders: 50, level: 'Ngopers Holic', icon: '👑', desc: 'Mulai ketagihan', voucher: 'Diskon Rp600/transaksi', discount: 600 }
];

let ACCOUNT_SPEND_LEVELS = [
    { minSpend: 0, maxSpend: 149999, nextThreshold: 150000, level: 'Anak Baru Ngopi', icon: '🌱', cashbackRate: 0 },
    { minSpend: 150000, maxSpend: 299999, nextThreshold: 300000, level: 'Ngopers Amatir', icon: '🐣', cashbackRate: 0.01 },
    { minSpend: 300000, maxSpend: 499999, nextThreshold: 500000, level: 'Ngopers Addict', icon: '🔥', cashbackRate: 0.03 },
    { minSpend: 500000, maxSpend: 1000000, nextThreshold: 1000000, level: 'Ngopers Holic', icon: '👑', cashbackRate: 0.06 }
];

// Fungsi untuk mengambil data konfigurasi dari Supabase saat aplikasi dibuka
async function fetchDynamicConfigsFromDB() {
    try {
        // 1. Ambil Bundling Presets
        const { data: bundleData } = await supabaseClient.from('bundling_presets').select('*');
        if (bundleData && bundleData.length > 0) {
            const tempPresets = {};
            bundleData.forEach(row => {
                tempPresets[row.key_name] = {
                    slots: row.slots,
                    desc: row.description,
                    items: row.items,
                    price: Number(row.price)
                };
            });
            BUNDLING_PRESETS = tempPresets;
        }

        // 2. Ambil Loyalty Config
        const { data: configData } = await supabaseClient.from('loyalty_config').select('*');
        if (configData && configData.length > 0) {
            const orderLevels = configData.filter(r => r.tier_type === 'order_level').sort((a,b) => a.min_requirement - b.min_requirement);
            if (orderLevels.length > 0) {
                LOYALTY_LEVELS = orderLevels.map(r => ({
                    minOrders: r.min_requirement,
                    level: r.level_name,
                    icon: r.icon,
                    desc: r.description,
                    voucher: r.voucher_text,
                    discount: r.discount_amount
                }));
            }
        }

        // 3. Ambil Data Outlet Premium (Surcharge)
        const { data: premiumData } = await supabaseClient.from('outlet_surcharges').select('outlet_id');
        if (premiumData) {
            premiumOutletIds = premiumData.map(d => Number(d.outlet_id));
        }
    } catch (e) {
        console.warn('Gagal memuat konfigurasi dinamis dari Supabase, menggunakan data default lokal.', e);
    }
}

const brandCategories = {
    'Kopi Kenangan': ['Semua', 'Paket Hemat', 'Kopi', 'Non-Kopi', 'Snack', 'Korean Food', 'Nasi', 'Pasta', 'Ayam Goreng'],
    'Fore Coffee': ['Semua', 'Americano Series', 'Coffee', 'Non Coffee', 'Fore Signature', 'Fore Deli', 'Fore Junior', 'Ice Blended', 'Refresher', 'Sunny Burst Series', 'Tea', 'Foreveryone 1L', 'Others'],
    'Tomoro Coffee': ['Semua', 'Tomoro Signature', 'Classic Coffee', 'Fruity Series', 'Cloud Series', 'Non Coffee', 'Matcha Series']
};

// Variabel penampung password WiFi dari Supabase (dengan fallback default jika offline)
let brandWifiData = {
    "Kopi Kenangan": ["NgopiSantuy#01"],
    "Tomoro Coffee": ["TerimaKasih"],
    "Fore Coffee": ["Foreveryone"]
};

// 🔥 FUNGSI BARU: Parser otomatis membaca deskripsi untuk mengisi slot bundling
function parseBundleDescription(desc) {
    if (!desc) return null;
    // Pecah berdasarkan tanda |
    const parts = desc.split('|').map(p => p.trim());
    let items = [];
    
    parts.forEach(part => {
        // Deteksi kuantitas seperti "2x", "2X", "2 ", dll.
        const match = part.match(/^(\d+)\s*[xX]?\s*(.+)$/);
        let qty = 1;
        let itemName = part;
        
        if (match) {
            qty = parseInt(match[1], 10);
            itemName = match[2].trim();
        }
        
        // Deteksi Ukuran (R) / (L) / (Regular) / (Large)
        let size = '';
        if (itemName.match(/\(R\)/i)) { size = 'Regular'; itemName = itemName.replace(/\(R\)/i, '').trim(); }
        else if (itemName.match(/\(L\)/i)) { size = 'Large'; itemName = itemName.replace(/\(L\)/i, '').trim(); }
        else if (itemName.match(/\(Regular\)/i)) { size = 'Regular'; itemName = itemName.replace(/\(Regular\)/i, '').trim(); }
        else if (itemName.match(/\(Large\)/i)) { size = 'Large'; itemName = itemName.replace(/\(Large\)/i, '').trim(); }
        
        // Masukkan item sebanyak kuantitasnya (misal 2x berarti push 2 kali)
        for (let i = 0; i < qty; i++) {
            items.push({ name: itemName, size: size });
        }
    });
    
    return items;
}

function getPresetForItem(item) {
    if (!item) return null;
    
    // 1. Cek dari database Supabase terlebih dahulu
    if (BUNDLING_PRESETS[item.name]) return BUNDLING_PRESETS[item.name];

    const itemName = (item.name || '').toLowerCase();
    const dbDesc = (item.description || item.desc || '').toLowerCase();

    // 2. HARDCODED FALLBACK: Satnight Berdua (2 Slot Otomatis)
    if (itemName.includes('satnight berdua') || itemName.includes('sat night berdua')) {
        return {
            desc: item.description || '✨ Menu sudah dipilih otomatis!',
            items: [
                { name: 'Butterscotch Aren Latte', size: 'Large' },
                { name: 'Creamy Aren Latte', size: 'Large' }
            ]
        };
    }

    // 3. HARDCODED FALLBACK: Satnight Bertiga (3 Slot Otomatis)
    if (itemName.includes('satnight bertiga') || itemName.includes('sat night bertiga')) {
        return {
            desc: item.description || '✨ Menu sudah dipilih otomatis!',
            items: [
                { name: 'Pistachio Aren Latte', size: 'Large' },
                { name: 'Creamy Aren Latte', size: 'Large' },
                { name: 'Butterscotch Aren Latte', size: 'Large' }
            ]
        };
    }

    // 4. HARDCODED FALLBACK: Couple Regular A (2 Slot Otomatis)
    if (itemName.includes('couple regular a')) {
        return {
            desc: item.description || '✨ Menu sudah dipilih otomatis!',
            items: [
                { name: 'Kopi Kenangan Mantan', size: 'Regular' },
                { name: 'Kopi Kenangan Mantan', size: 'Regular' }
            ]
        };
    }

    // 5. HARDCODED FALLBACK: Couple Regular B (2 Slot Otomatis)
    if (itemName.includes('couple regular b')) {
        return {
            desc: item.description || '✨ Menu sudah dipilih otomatis!',
            items: [
                { name: 'Butterscotch Aren Latte', size: 'Regular' },
                { name: 'Butterscotch Aren Latte', size: 'Regular' }
            ]
        };
    }

    // 6. OTOMATISASI BUNDLING DRINK & FOOD BERDASARKAN DESKRIPSI
    if (itemName.includes('bundling drink & food')) {
        // Coba parse langsung dari deskripsi database
        const parsedItems = parseBundleDescription(item.description || item.desc);
        
        // Jika berhasil di-parse dan menghasilkan minimal 2 item, gunakan hasil parse
        if (parsedItems && parsedItems.length >= 2) {
            return {
                desc: item.description || '✨ Menu sudah dipilih otomatis!',
                items: parsedItems
            };
        }
        
        // Fallback manual (jika deskripsi kosong atau gagal di-parse)
        const matchNum = itemName.match(/(\d+)/);
        const num = matchNum ? parseInt(matchNum[1]) : 1;
        const fallbacks = {
            1: [{ name: 'Americano', size: 'Regular' }, { name: 'Raspberry Hibiscus', size: 'Regular' }, { name: 'Roti Coklat Klasik' }, { name: 'Roti Coklat Klasik' }],
            2: [{ name: 'Raspberry Hibiscus', size: 'Regular' }, { name: 'Raspberry Hibiscus', size: 'Regular' }, { name: 'Roti Coklat Klasik' }, { name: 'Roti Coklat Klasik' }],
            3: [{ name: 'Kopi Kenangan Mantan', size: 'Regular' }, { name: 'Kopi Kenangan Mantan', size: 'Regular' }, { name: 'Roti Susu Manis' }, { name: 'Roti Susu Manis' }],
            4: [{ name: 'Cafe Malt Latte', size: 'Regular' }, { name: 'Cafe Malt Latte', size: 'Regular' }, { name: 'Roti Srikaya' }, { name: 'Roti Srikaya' }],
            5: [{ name: 'OG Thai Tea', size: 'Regular' }, { name: 'OG Thai Tea', size: 'Regular' }, { name: 'Roti Susu Manis' }, { name: 'Roti Susu Manis' }],
            6: [{ name: 'Kopi Kenangan Mantan', size: 'Regular' }, { name: 'Kopi Kenangan Mantan', size: 'Regular' }, { name: 'Chocolate Choux Puff' }, { name: 'Chocolate Choux Puff' }],
            7: [{ name: 'Kopi Kenangan Mantan', size: 'Regular' }, { name: 'Kopi Kenangan Mantan', size: 'Regular' }, { name: 'Wahyu Sapi Toast' }, { name: 'Wahyu Sapi Toast' }],
            8: [{ name: 'Kopi Kenangan Mantan', size: 'Regular' }, { name: 'Kopi Kenangan Mantan', size: 'Regular' }, { name: 'Salt Bread Choco Butter' }, { name: 'Salt Bread Choco Butter' }]
        };
        return {
            desc: item.description || '✨ Menu sudah dipilih otomatis!',
            items: fallbacks[num] || fallbacks[1]
        };
    }
    
    return null;
}

// ======================== STATE ========================
let selectedBrand = 'Kopi Kenangan';
let activeWifiBrandTab = 'Kopi Kenangan';
let pendingBrand = null;
let selectedOutlet = null;
let currentCategory = 'Semua';
let cart = [];
let currentSelectedItem = null;
let selectedCustomization = { size: 'Regular', sizeUpcharge: 0, temp: 'Ice', sugar: 'Normal Sugar', ice: 'Normal Ice' };
let outletCurrentPage = 1;
const outletItemsPerPage = 10;
let outlets = [];
let filteredOutletList = [];
let activeBundlingItem = null;
let activeSlotIndex = 0;
let bundlingSlots = [];
let tempSelectedSlotItem = null;
let pendingWAUrl = '';

// ADMIN PANEL STATE
const ADMIN_PASSWORD = 'rahasia123';

// ======================== FUNGSI CEK JENIS MENU ========================
function isFoodCategory(category) {
    const foodCategories = ['Snack', 'Nasi', 'Korean Food', 'Pasta', 'Ayam Goreng', 'Paket Hemat'];
    return foodCategories.includes(category);
}

function isSnackCategory(category) {
    const snackCategories = ['Snack', 'Nasi', 'Korean Food', 'Pasta', 'Ayam Goreng'];
    return snackCategories.includes(category);
}

function isBundleCategory(category) {
    return category === 'Paket Hemat';
}

function getItemDisplayName(item) {
    // Untuk item bundling, tampilkan nama paketnya
    if (item.isBundle || item.category === 'Paket Hemat') {
        return item.name;
    }
    return item.name;
}

// ======================== FUNGSI UTAMA ========================

function toggleSidebar() {
    const overlay = document.getElementById('sidebarOverlay');
    const content = document.getElementById('sidebarContent');
    overlay.classList.toggle('active');
    content.classList.toggle('open');
}

function toggleTheme() {
    const body = document.getElementById('mainBody');
    body.classList.toggle('dark-theme');
    const isDark = body.classList.contains('dark-theme');
    const icon = document.getElementById('themeIcon');
    if (isDark) {
        icon.classList.remove('fa-moon');
        icon.classList.add('fa-sun');
    } else {
        icon.classList.remove('fa-sun');
        icon.classList.add('fa-moon');
    }
}

function openModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.remove('hidden');
    const content = modal.querySelector('#trackModalContent') || modal.querySelector('.bg-brand-900') || modal.querySelector('.panel-modal-box');
    if (content) {
        content.style.transition = 'all 0.3s cubic-bezier(0.2, 0.9, 0.4, 1)';
        void content.offsetWidth;
        content.style.transform = 'scale(1)';
        content.style.opacity = '1';
    }
    if (id === 'outletModal') renderOutlets();
    if (id === 'cartModal') {
        if (typeof loggedInCustomer !== 'undefined' && loggedInCustomer) {
            const nameInput = document.getElementById('custName');
            const phoneInput = document.getElementById('custPhone');
            if (nameInput && !nameInput.value.trim() && loggedInCustomer.name) nameInput.value = loggedInCustomer.name;
            if (phoneInput && !phoneInput.value.trim() && loggedInCustomer.phone) phoneInput.value = loggedInCustomer.phone;
        }
        if (typeof syncCustomerLoyaltyDiscount === 'function') {
            syncCustomerLoyaltyDiscount();
        }
    }
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    const content = modal.querySelector('#trackModalContent') || modal.querySelector('.bg-brand-900') || modal.querySelector('.panel-modal-box');
    if (content) {
        content.style.transform = 'scale(0.95)';
        content.style.opacity = '0';
        setTimeout(() => modal.classList.add('hidden'), 300);
    } else {
        modal.classList.add('hidden');
    }
}

function showToast(message) {
    const toast = document.getElementById('toastNotification');
    const msgEl = document.getElementById('toastMessage');
    if (!toast || !msgEl) return;
    msgEl.innerText = message;
    toast.classList.remove('translate-x-full', 'opacity-0');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.add('translate-x-full', 'opacity-0'), 2500);
}

function showValidationAlert(message) {
    const modal = document.getElementById('validationAlertModal');
    const msgEl = document.getElementById('validationAlertMessage');
    if (!modal || !msgEl) return;
    msgEl.innerText = message;
    modal.classList.remove('hidden');
    setTimeout(() => {
        const content = modal.querySelector('.bg-brand-900');
        if (content) {
            content.style.transform = 'scale(1)';
            content.style.opacity = '1';
        }
    }, 10);
}

// ======================== ADMIN PANEL ========================
function openAdminPanel() {
    document.getElementById('mainBody').style.display = 'none';
    document.getElementById('adminPanel').style.display = 'block';
    document.getElementById('adminPanel').classList.add('active');
    document.getElementById('adminPasswordInput').value = '';
    document.getElementById('adminLock').style.display = 'block';
    document.getElementById('adminDashboardContent').style.display = 'none';
}

function closeAdminPanel() {
    document.getElementById('mainBody').style.display = 'block';
    document.getElementById('adminPanel').style.display = 'none';
    document.getElementById('adminPanel').classList.remove('active');
}

function unlockAdmin() {
    const pass = document.getElementById('adminPasswordInput').value.trim();
    if (pass === ADMIN_PASSWORD) {
        document.getElementById('adminLock').style.display = 'none';
        document.getElementById('adminDashboardContent').style.display = 'block';
        loadAdminOrders();
        if (typeof loadAdminShareProofs === 'function') loadAdminShareProofs();
    } else {
        alert('❌ Password salah!');
        document.getElementById('adminPasswordInput').value = '';
        document.getElementById('adminPasswordInput').focus();
    }
}

async function loadAdminOrders() {
    const container = document.getElementById('adminOrderList');
    container.innerHTML = '<p style="text-align:center; color:#9ca3af; padding:20px;">Memuat data...</p>';

    try {
        const { data: orders, error } = await supabaseClient
            .from('orders')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Fetch share proofs to match with orders
        let shareProofs = [];
        try {
            const { data: spData } = await supabaseClient.from('paket_hemat_shares').select('*').not('proof_image_url', 'is', null);
            if (spData) shareProofs = spData;
        } catch (e) {
            console.warn("Gagal load share proofs", e);
        }

        if (!orders || orders.length === 0) {
            container.innerHTML = '<p style="text-align:center; color:#9ca3af; padding:20px;">Belum ada pesanan.</p>';
            return;
        }

        container.innerHTML = orders.map(order => {
            const statusClass = (order.status || 'Pesanan Diterima').toLowerCase().replace(/\s/g, '');
            const date = new Date(order.created_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' });
            const orderCode = order.order_code || `NGOP-${new Date(order.created_at).getFullYear()}${String(new Date(order.created_at).getMonth() + 1).padStart(2, '0')}-${String(order.id).padStart(4, '0')}`;

            let totalItems = 0;
            let itemsText = '';
            let brands = [];
            if (order.items && Array.isArray(order.items)) {
                totalItems = order.items.length;
                itemsText = order.items.map(item => {
                    if (item.brand) brands.push(item.brand);
                    return `<span style="color:#9ca3af; font-size:11px;">${item.name} ${item.size ? `(${item.size})` : ''}</span>`;
                }).join(', ');
            }
            const uniqueBrands = [...new Set(brands)];

            // Match share proof
            const cleanPhone = String(order.customer_phone).replace(/[^0-9]/g, '');
            const relatedShares = shareProofs.filter(sp => String(sp.customer_phone).replace(/[^0-9]/g, '') === cleanPhone);
            
            let proofHtml = '';
            if (relatedShares.length > 0) {
                // Find one with proof_image_url
                const validShare = relatedShares.find(s => s.proof_image_url);
                if (validShare) {
                    proofHtml = `
                        <div style="margin-top: 12px; padding: 10px; background: rgba(255, 193, 7, 0.1); border: 1px solid #FFC107; border-radius: 12px; display: flex; align-items: center; gap: 10px;">
                            <div style="flex: 1;">
                                <div style="font-size: 11px; font-weight: 900; color: #FFC107;">📸 BUKTI FOTO SHARE TERLAMPIR</div>
                                <div style="font-size: 10px; color: #9ca3af;">Customer telah mengunggah bukti share promo.</div>
                            </div>
                            <img src="${validShare.proof_image_url}" onclick="showDirectImagePreview('${validShare.proof_image_url}', '${validShare.customer_name}', '${validShare.customer_phone}')" style="width: 50px; height: 50px; object-fit: cover; border-radius: 8px; border: 2px solid #FFC107; cursor: pointer;" title="Klik untuk memperbesar" />
                        </div>
                    `;
                }
            }

            return `
                <div class="admin-card">
                    <div style="display:flex; justify-content:space-between; align-items:start;">
                        <div>
                            <span style="color:#FFC107; font-weight:900; font-size:14px;">${orderCode}</span>
                            <span style="color:#6b7280; font-size:10px; margin-left:8px;">${date}</span>
                            ${uniqueBrands.length > 0 ? `<span style="color:#fde047; font-size:9px; margin-left:8px;">${uniqueBrands.join(', ')}</span>` : ''}
                        </div>
                        <span class="admin-badge-${statusClass}">${order.status || 'Pesanan Diterima'}</span>
                    </div>
                    <div style="margin-top:4px;">
                        <span style="color:white; font-weight:bold; font-size:14px;">${order.customer_name}</span>
                        <span style="color:#6b7280; font-size:11px; margin-left:8px;">${order.customer_phone}</span>
                    </div>
                    <div style="color:#9ca3af; font-size:11px; margin-top:4px;">
                        ${itemsText || order.notes || 'Tidak ada item'}
                        <span style="margin-left:8px;">(${totalItems} item)</span>
                    </div>
                    ${proofHtml}
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px; padding-top:12px; border-top:1px solid #1B4326;">
                        <span style="color:#FFC107; font-weight:900;">Rp${Number(order.total_price).toLocaleString('id-ID')}</span>
                        <div style="display:flex; align-items:center; gap:8px;">
                            <select class="admin-status-select" onchange="updateOrderStatusAdmin('${order.id}', this.value)">
                                <option value="Pesanan Diterima" ${order.status === 'Pesanan Diterima' ? 'selected' : ''}>Diterima</option>
                                <option value="Sedang Diproses" ${order.status === 'Sedang Diproses' ? 'selected' : ''}>Diproses</option>
                                <option value="Siap Diambil/Diantar" ${order.status === 'Siap Diambil/Diantar' ? 'selected' : ''}>Siap</option>
                                <option value="Selesai" ${order.status === 'Selesai' ? 'selected' : ''}>Selesai</option>
                                <option value="Dibatalkan" ${order.status === 'Dibatalkan' ? 'selected' : ''} style="color: #ef4444; font-weight: bold;">Cancel / Batal</option>
                            </select>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

    } catch (err) {
        console.error('Error:', err);
        container.innerHTML = '<p style="text-align:center; color:#ef4444; padding:20px;">Gagal memuat data. Coba refresh.</p>';
    }
}

// Helper: Ekstrak poin cashback & poin terpakai dari order (mendukung kolom langsung maupun fallback dari notes)
function extractOrderEarnedPoints(orderObj) {
    if (!orderObj) return 0;
    const directPts = Number(orderObj.points_earned) || 0;
    if (directPts > 0) return directPts;
    const notesStr = String(orderObj.notes || '');
    const match = notesStr.match(/Cashback Poin:\s*\+?(\d+)/i);
    if (match && match[1]) return parseInt(match[1], 10) || 0;
    return 0;
}

function extractOrderUsedPoints(orderObj) {
    if (!orderObj) return 0;
    const directUsed = Number(orderObj.point_used) || 0;
    if (directUsed > 0) return directUsed;
    const notesStr = String(orderObj.notes || '');
    const match = notesStr.match(/\((\d+)\s*Poin\)/i);
    if (match && match[1]) return parseInt(match[1], 10) || 0;
    return 0;
}

async function updateOrderStatusAdmin(orderId, newStatus) {
    try {
        // 1. Ambil seluruh data order
        const { data: currentOrder, error: fetchErr } = await supabaseClient
            .from('orders')
            .select('*')
            .eq('id', orderId)
            .single();

        if (fetchErr) throw fetchErr;

        const prevStatus = (currentOrder?.status || '').toLowerCase();
        const earnedPts = extractOrderEarnedPoints(currentOrder);

        // 2. Update status di database
        const { error: updateErr } = await supabaseClient
            .from('orders')
            .update({ status: newStatus })
            .eq('id', orderId);

        if (updateErr) throw updateErr;

        // 3. Logika Poin
        if (newStatus.toLowerCase().includes('batal') || newStatus.toLowerCase().includes('cancel')) {
            if (currentOrder && currentOrder.customer_phone && prevStatus.includes('selesai')) {
                await revokePointsOnCancellation(orderId, currentOrder.customer_phone, earnedPts);
            }
        }
        
        if (newStatus === 'Selesai' || newStatus === 'Sudah selesai') {
            if (!prevStatus.includes('selesai')) { 
                await awardOrderPointsToCustomer(orderId, currentOrder.customer_phone, earnedPts);
            }
        }
        
        alert('✅ Status berhasil diperbarui & Poin diproses!');
        loadAdminOrders();
    } catch (err) {
        alert('❌ Gagal: ' + err.message);
        console.error("Error update status:", err);
    }
}

async function revokePointsOnCancellation(orderId, customerPhone, fallbackPts = 0) {
    try {
        const { data: order, error } = await supabaseClient
            .from('orders')
            .select('*')
            .eq('id', orderId)
            .single();

        const ptsToRevoke = extractOrderEarnedPoints(order) || Number(fallbackPts) || 0;
        if (error || ptsToRevoke <= 0) return;

        const variants = normalizePhoneVariants(customerPhone);
        const { data: customer } = await supabaseClient
            .from('customers')
            .select('id, phone, points')
            .in('phone', variants)
            .maybeSingle();

        if (customer) {
            const newPoints = Math.max(0, (Number(customer.points) || 0) - ptsToRevoke);
            await supabaseClient
                .from('customers')
                .update({ points: newPoints })
                .eq('id', customer.id);

            try {
                await supabaseClient.from('orders').update({ points_awarded: false }).eq('id', orderId);
            } catch (e) {}

            const cleanPhone = String(customer.phone || customerPhone || '').replace(/[^0-9]/g, '');
            if (cleanPhone) {
                try {
                    let awardedIds = JSON.parse(localStorage.getItem(`ngopa_awarded_order_ids_${cleanPhone}`) || '[]');
                    awardedIds = awardedIds.filter(id => String(id) !== String(orderId));
                    localStorage.setItem(`ngopa_awarded_order_ids_${cleanPhone}`, JSON.stringify(awardedIds));
                } catch (e) {}
            }

            if (loggedInCustomer && String(loggedInCustomer.id) === String(customer.id)) {
                loggedInCustomer.points = newPoints;
                localStorage.setItem('ngopa_customer', JSON.stringify(loggedInCustomer));
                logPointActivity('out', ptsToRevoke, `Order #NGOP-${orderId} Dibatalkan (Poin Ditarik)`, newPoints, null, `revoke-order-${orderId}`);
                loadAndCleanExpiredPointBatches(loggedInCustomer.phone);
                renderAccountModalUI();
            }
            console.log(`Berhasil menarik ${ptsToRevoke} poin dari customer ${customerPhone}`);
        }
    } catch (e) {
        console.error("Gagal menarik poin batal:", e);
    }
}

async function awardOrderPointsToCustomer(orderId, customerPhone, pointsToAward) {
    let pts = Number(pointsToAward) || 0;
    if (pts <= 0 && orderId) {
        try {
            const { data: ord } = await supabaseClient.from('orders').select('*').eq('id', orderId).maybeSingle();
            pts = extractOrderEarnedPoints(ord);
        } catch (e) {}
    }
    if (pts <= 0) {
        console.warn(`Poin tidak ditambahkan karena nilai poin 0 atau tidak valid: ${pointsToAward}`);
        return;
    }
    
    try {
        const variants = normalizePhoneVariants(customerPhone);
        const { data: customers, error: custErr } = await supabaseClient
            .from('customers')
            .select('id, phone, points')
            .in('phone', variants)
            .limit(1);

        if (custErr) {
            alert("GAGAL MENCARI CUSTOMER: " + custErr.message);
            return;
        }

        const customer = customers && customers.length > 0 ? customers[0] : null;

        if (customer) {
            // Cek apakah order ini sudah pernah diklaim sebelumnya agar tidak double-credit
            const cleanTargetPhone = String(customer.phone || customerPhone || '').replace(/[^0-9]/g, '');
            const awardedKey = `ngopa_awarded_order_ids_${cleanTargetPhone}`;
            let awardedIds = [];
            try {
                awardedIds = JSON.parse(localStorage.getItem(awardedKey) || '[]');
                if (!Array.isArray(awardedIds)) awardedIds = [];
            } catch (e) { awardedIds = []; }

            if (orderId && awardedIds.includes(String(orderId))) {
                console.log(`Order #${orderId} sudah pernah dikreditkan sebelumnya.`);
                return;
            }

            const newPoints = (Number(customer.points) || 0) + pts;
            
            const { error: updateErr } = await supabaseClient
                .from('customers')
                .update({ points: newPoints })
                .eq('id', customer.id);

            if (updateErr) {
                alert("❌ GAGAL UPDATE POIN KE DATABASE: " + updateErr.message);
                return;
            }

            try {
                await supabaseClient.from('orders').update({ points_awarded: true }).eq('id', orderId);
            } catch (e) {}

            if (orderId && cleanTargetPhone) {
                awardedIds.push(String(orderId));
                localStorage.setItem(awardedKey, JSON.stringify(awardedIds));
            }

            console.log(`✅ Berhasil menambah ${pts} poin ke Customer ID ${customer.id}. Total baru: ${newPoints}`);
            
            // Jika Admin & Customer ada di browser yang sama, update UI-nya tanpa menghapus batch lama
            if (typeof loggedInCustomer !== 'undefined' && loggedInCustomer && String(loggedInCustomer.id) === String(customer.id)) {
                loggedInCustomer.points = newPoints;
                localStorage.setItem('ngopa_customer', JSON.stringify(loggedInCustomer));
                
                const now = new Date();
                const expiresAt = addTwoMonthsDate(now);
                logPointActivity('in', pts, `Cashback Order Selesai (#NGOP-${orderId})`, newPoints, expiresAt, `order-in-${orderId}`);
                loadAndCleanExpiredPointBatches(loggedInCustomer.phone);
                renderPointExpiryUI();
                if (typeof renderAccountModalUI === 'function') renderAccountModalUI();
                if (typeof showToast === 'function') showToast(`🎁 +${pts} Poin Cashback masuk!`);
            }
        } else {
            alert(`CUSTOMER TIDAK DITEMUKAN: Nomor ${customerPhone} tidak ada di database.`);
        }
    } catch (e) {
        alert("ERROR SISTEM: " + e.message);
    }
}

// ======================== WIFI (SUPABASE INTEGRATED) ========================
async function fetchWifiPasswordsFromDB() {
    try {
        const { data, error } = await supabaseClient
            .from('wifi_passwords')
            .select('brand, passwords');

        if (!error && Array.isArray(data) && data.length > 0) {
            data.forEach(item => {
                if (item.brand && Array.isArray(item.passwords)) {
                    brandWifiData[item.brand] = item.passwords;
                }
            });
        }
    } catch (err) {
        console.warn('Gagal memuat password wifi dari Supabase:', err);
    }
}

async function renderWifiDisplay() {
    // Ambil data terbaru dari Supabase jika belum pernah dimuat
    if (!brandWifiData["Kopi Kenangan"] || brandWifiData["Kopi Kenangan"].length <= 1) {
        await fetchWifiPasswordsFromDB();
    }

    const now = new Date();
    const dayIdx = (now.getDate() - 1);
    const dateStr = now.toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' });
    
    const dateEl = document.getElementById('todayWifiDateStr');
    const badgeEl = document.getElementById('activeWifiBrandBadge');
    const targetLbl = document.getElementById('wifiTargetBrandLabel');
    const passValEl = document.getElementById('currentWifiDisplayVal');

    if (dateEl) dateEl.innerText = dateStr;
    if (badgeEl) badgeEl.innerText = activeWifiBrandTab;
    if (targetLbl) targetLbl.innerText = activeWifiBrandTab.toUpperCase();

    const passwords = brandWifiData[activeWifiBrandTab] || brandWifiData["Kopi Kenangan"] || [];
    const pass = passwords.length > 0 ? passwords[dayIdx % passwords.length] : "-";
    if (passValEl) passValEl.innerText = pass;

    ['Kopi-Kenangan', 'Tomoro-Coffee', 'Fore-Coffee'].forEach(id => {
        const cleanName = id.replace(/-/g, ' ');
        const tabBtn = document.getElementById(`wifiTab-${id}`);
        if (tabBtn) {
            if (cleanName === activeWifiBrandTab) {
                tabBtn.className = "wifi-tab-btn py-1.5 px-2 rounded-xl text-[11px] font-black transition border text-center bg-brand-800 text-white border-brand-700 shadow-sm";
            } else {
                tabBtn.className = "wifi-tab-btn py-1.5 px-2 rounded-xl text-[11px] font-black transition border text-center bg-brand-50 dark:bg-brand-800 text-gray-600 dark:text-gray-300 border-brand-200 dark:border-brand-700";
            }
        }
    });
}

function switchWifiTab(brandName) {
    activeWifiBrandTab = brandName;
    renderWifiDisplay();
}

function copyCurrentWifi() {
    const pass = document.getElementById('currentWifiDisplayVal').innerText;
    navigator.clipboard.writeText(pass).then(() => showToast(`Password WiFi ${activeWifiBrandTab} berhasil disalin!`)).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = pass;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        showToast(`Password WiFi ${activeWifiBrandTab} berhasil disalin!`);
    });
}

// ======================== OUTLET ========================

function validateOutletSelection() {
    if (!selectedOutlet) {
        openModal('outletNoticeModal');
        return false;
    }
    return true;
}

function proceedToChooseOutlet() {
    closeModal('outletNoticeModal');
    setTimeout(() => openModal('outletModal'), 200);
}

function checkOutletStatus(hoursStr) {
    if (!hoursStr) return { isOpen: true, statusText: "Buka" };
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const match = hoursStr.match(/(\d{1,2})[:.](\d{2})\s*-\s*(\d{1,2})[:.](\d{2})/);
    if (!match) return { isOpen: true, statusText: "Buka" };
    const openMinutes = parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
    const closeMinutes = parseInt(match[3], 10) * 60 + parseInt(match[4], 10);
    let isOpen = false;
    if (closeMinutes >= openMinutes) {
        isOpen = currentMinutes >= openMinutes && currentMinutes < closeMinutes;
    } else {
        isOpen = currentMinutes >= openMinutes || currentMinutes < closeMinutes;
    }
    return { isOpen: isOpen, statusText: isOpen ? "Buka" : "Tutup" };
}

async function renderOutlets() {
    const container = document.getElementById('outletList');
    const searchQuery = document.getElementById('outletSearchInput')?.value?.toLowerCase().trim() || '';

    if (!supabaseClient || typeof supabaseClient.from !== 'function') {
        console.error('⚠️ Supabase belum siap di renderOutlets!');
        container.innerHTML = `<p class="text-center text-xs text-red-400 py-8">⚠️ Supabase belum siap. Refresh halaman.</p>`;
        return;
    }

    try {
        let query = supabaseClient.from('outlets').select('*');
        if (searchQuery) {
            query = query.or(`name.ilike.%${searchQuery}%,address.ilike.%${searchQuery}%`);
        }
        const { data: outletsData, error } = await query;
        if (error) {
            console.error("Gagal mengambil outlet dari Supabase:", error);
            container.innerHTML = `<p class="text-center text-xs text-red-400 py-8">Gagal memuat outlet.</p>`;
            return;
        }
        const filteredOutlets = outletsData || [];
        filteredOutletList = filteredOutlets;
        outlets = filteredOutlets;

        const totalPages = Math.ceil(filteredOutlets.length / outletItemsPerPage) || 1;
        if (outletCurrentPage > totalPages) outletCurrentPage = totalPages;
        const startIdx = (outletCurrentPage - 1) * outletItemsPerPage;
        const pageData = filteredOutlets.slice(startIdx, startIdx + outletItemsPerPage);

        document.getElementById('outletPageInfo').innerText = `Halaman ${outletCurrentPage} / ${totalPages}`;
        document.getElementById('prevPageBtn').disabled = (outletCurrentPage === 1);
        document.getElementById('nextPageBtn').disabled = (outletCurrentPage === totalPages);

        if (pageData.length === 0) {
            container.innerHTML = `<p class="text-center text-xs text-gray-400 py-8">Outlet tidak ditemukan.</p>`;
            return;
        }

        container.innerHTML = pageData.map(o => {
            const statusObj = checkOutletStatus(o.hours);
            const isSelected = selectedOutlet && o.id === selectedOutlet.id;
             // 🔥 CEK PREMIUM & BUAT HTML BADGE
            const isPremium = isOutsideJava(o);
            const premiumBadgeHtml = isPremium ? `<span class="text-[8px] bg-rose-500 text-white font-black px-1.5 py-0.5 rounded-md ml-1 shrink-0">Outlet Mahal</span>` : '';
            const badgeHtml = statusObj.isOpen
                ? `<span class="text-[9px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold px-2 py-0.5 rounded-full flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> Buka</span>`
                : `<span class="text-[9px] bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 font-bold px-2 py-0.5 rounded-full flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span> Tutup</span>`;
            
            return `
<div onclick="chooseOutlet(${o.id})" class="p-3 border rounded-2xl hover:border-brand-500 cursor-pointer transition flex justify-between items-center bg-white dark:bg-brand-900 ${isSelected ? 'bg-amber-50/50 dark:bg-brand-700 border-amber-400' : 'border-gray-100 dark:border-brand-700'}">
    <div class="flex-1 pr-2">
        <div class="flex items-center justify-between gap-1.5 mb-0.5">
            <!-- 🔥 TAMBAHKAN PREMIUM BADGE DI SINI -->
            <h4 class="font-extrabold text-xs text-brand-900 dark:text-white flex items-center flex-wrap gap-1">
                ${o.name} ${premiumBadgeHtml}
            </h4>
            ${badgeHtml}
        </div>
        <p class="text-[10px] text-amber-600 dark:text-amber-400 font-bold flex items-center gap-1">
            <i class="fa-regular fa-clock text-[9px]"></i> ${o.hours || 'Jam operasional tidak tersedia'}
        </p>
        <p class="text-[11px] text-gray-500 dark:text-gray-300 mt-1 line-clamp-2">${o.address}</p>
    </div>
</div>
`;
        }).join('');
    } catch (err) {
        console.error('Error di renderOutlets:', err);
        container.innerHTML = `<p class="text-center text-xs text-red-400 py-8">Error: ${err.message}</p>`;
    }
}

function chooseOutlet(id) {
    const found = outlets.find(o => o.id === id);
    if (!found) return;
    selectedOutlet = found;
    
    // 🔥 UPDATE HEADER BARIS KEDUA
    document.getElementById('currentOutletName').innerText = selectedOutlet.name;
     // 🔥 TAMPILKAN BADGE JIKA HARGA LEBIH MAHAL (isOutsideJava = true)
    const isPremium = isOutsideJava(selectedOutlet);
    const badgeEl = document.getElementById('headerOutletPremiumBadge');
    if (badgeEl) {
        if (isPremium) badgeEl.classList.remove('hidden');
        else badgeEl.classList.add('hidden');
    }
    
    const detailsContainer = document.getElementById('headerOutletDetails');
    const addressSpan = document.getElementById('currentOutletAddress');
    const hoursSpan = document.getElementById('currentOutletHours');

    // Tampilkan detail alamat & jam
    if (detailsContainer) {
        detailsContainer.classList.remove('hidden');
        detailsContainer.classList.add('flex');
    }
    if (addressSpan) addressSpan.innerText = selectedOutlet.address;
    if (hoursSpan) hoursSpan.innerText = selectedOutlet.hours || 'Tutup';

    // Logika bawaan dari kode Anda (Tidak diubah)
    const statusObj = checkOutletStatus(selectedOutlet.hours);
    document.getElementById('successOutletTitle').innerText = selectedOutlet.name;
    document.getElementById('successOutletAddr').innerText = selectedOutlet.address;
    document.getElementById('zoneWarningText').innerText = !statusObj.isOpen ? `⚠️ Perhatian: Outlet ini saat ini sedang TUTUP (${selectedOutlet.hours})` : "";
    
    closeModal('outletModal');
    openModal('outletSuccessModal');
    setTimeout(() => closeModal('outletSuccessModal'), 1400);
    renderMenu();
}

function onOutletSearch() {
    outletCurrentPage = 1;
    renderOutlets();
}

function changeOutletPage(delta) {
    const totalPages = Math.ceil(filteredOutletList.length / outletItemsPerPage) || 1;
    const newPage = outletCurrentPage + delta;
    if (newPage >= 1 && newPage <= totalPages) { outletCurrentPage = newPage; renderOutlets(); }
}

function confirmLastOutlet() { closeModal('outletModal'); }
function closeLastOutletBanner() { document.getElementById('lastOutletBanner').classList.add('hidden'); }

// ======================== BRAND & CATEGORY ========================

function selectBrand(brandName) {
    if (selectedBrand === brandName) return;
    if (cart.length > 0) {
        pendingBrand = brandName;
        openModal('changeBrandModal');
        return;
    }
    triggerGridAnimation();
    executeBrandSwitch(brandName);
}

function confirmChangeBrand() {
    cart = [];
    updateCartUI();
    triggerGridAnimation();
    executeBrandSwitch(pendingBrand);
    closeModal('changeBrandModal');
    pendingBrand = null;
}

function isForeCoffeeSelected() {
    return selectedBrand === 'Fore Coffee';
}

function getBrandConversionFactor() {
    return isForeCoffeeSelected() ? 0.1 : 1;
}

function executeBrandSwitch(brandName) {
    selectedBrand = brandName;
    activeWifiBrandTab = brandName;
    document.querySelectorAll('.brand-card-custom').forEach(card => card.classList.remove('active'));
    const targetCard = document.getElementById(`brand-${brandName.replace(/\s+/g, '-')}`);
    if (targetCard) targetCard.classList.add('active');
    currentCategory = 'Semua';
    renderCategories();
    renderWifiDisplay();
    renderMenu();
    if (typeof syncCustomerLoyaltyDiscount === 'function') {
        syncCustomerLoyaltyDiscount();
    } else {
        updateCartUI();
    }
}

function isOutsideJava(outletObj) {
    if (!outletObj) return false;

    // 🔥 1. CEK DARI DATABASE PREMIUM OUTLET
    // Jika ID outlet ada di dalam tabel outlet_surcharges, maka langsung return true
    if (premiumOutletIds.includes(Number(outletObj.id))) {
        return true;
    }

    // Jika tidak ada di database, gunakan logika lama (berdasarkan alamat/nama)
    if (!outletObj.address) return false;
    const addr = outletObj.address.toLowerCase();
    const name = outletObj.name.toLowerCase();
    const outsideKeywords = ['bali', 'sulawesi', 'sumatera', 'kalimantan', 'ntb', 'ntt', 'papua', 'maluku', 'jambi', 'lampung', 'medan', 'palembang', 'batam', 'makassar', 'samarinda', 'banjarmasin', 'pontianak', 'manado', 'pekanbaru', 'aceh'];
    let isOutside = false;
    outsideKeywords.forEach(keyword => { if (addr.includes(keyword)) isOutside = true; });
    if (['tangerang', 'bekasi', 'bogor', 'depok', 'jakarta', 'surabaya', 'bandung'].some(k => addr.includes(k))) isOutside = false;
    
    if (selectedBrand === 'Kopi Kenangan') {
        const premiumKeywords = ['stasiun', 'mall', 'dt', 'drive thru', 'transmart', 'trans', 'plaza', 'square'];
        let isPremiumLocation = false;
        premiumKeywords.forEach(keyword => { if (name.includes(keyword)) isPremiumLocation = true; });
        if (isPremiumLocation) return true;
    }
    return isOutside;
}

function renderCategories() {
    const currentCatList = brandCategories[selectedBrand] || ['Semua', 'Kopi', 'Non-Kopi', 'Paket Hemat'];
    function getCategoryIcon(catName) {
        const name = catName.toLowerCase();
        if (name.includes('semua')) return 'fa-solid fa-th-large';
        if (name.includes('kopi') || name.includes('coffee')) return 'fa-solid fa-mug-hot';
        if (name.includes('non-kopi') || name.includes('non coffee')) return 'fa-solid fa-glass-water';
        if (name.includes('paket') || name.includes('bundling')) return 'fa-solid fa-gift';
        if (name.includes('snack') || name.includes('food')) return 'fa-solid fa-utensils';
        if (name.includes('pasta')) return 'fa-solid fa-bowl-food';
        if (name.includes('nasi')) return 'fa-solid fa-bowl-rice';
        if (name.includes('ayam')) return 'fa-solid fa-drumstick-bite';
        if (name.includes('korean')) return 'fa-solid fa-bowl-hot';
        if (name.includes('tea') || name.includes('thai')) return 'fa-solid fa-mug-saucer';
        if (name.includes('matcha')) return 'fa-solid fa-leaf';
        if (name.includes('frappe') || name.includes('blended')) return 'fa-solid fa-snowflake';
        if (name.includes('series')) return 'fa-solid fa-list-ul';
        if (name.includes('deli')) return 'fa-solid fa-bread-slice';
        if (name.includes('junior')) return 'fa-solid fa-child';
        if (name.includes('signature')) return 'fa-solid fa-star';
        if (name.includes('refresher')) return 'fa-solid fa-wine-bottle';
        if (name.includes('1l')) return 'fa-solid fa-flask';
        return 'fa-solid fa-tag';
    }
    document.getElementById('categoryContainer').innerHTML = currentCatList.map(cat => {
        const iconClass = getCategoryIcon(cat);
        const isActive = currentCategory === cat;
        return `<button onclick="setCategory('${cat}')" class="cat-item px-4 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all duration-300 flex items-center gap-1.5 ${isActive ? 'active' : 'bg-white text-brand-800 border border-brand-200'}"><i class="${iconClass} cat-icon"></i> ${cat}</button>`;
    }).join('');
}

function setCategory(cat) {
    if (currentCategory === cat) return;
    currentCategory = cat;
    document.querySelectorAll('#categoryContainer button').forEach(btn => {
        const btnText = btn.textContent.trim();
        if (btnText === cat) {
            btn.classList.add('active');
            btn.classList.remove('bg-white', 'text-brand-800', 'border-brand-200');
        } else {
            btn.classList.remove('active');
            btn.classList.add('bg-white', 'text-brand-800', 'border-brand-200');
        }
    });

    renderMenu();

    // 🔥 SCROLL HORIZONTAL KE KATEGORI YANG DIPILIH (AGAR TERLIHAT DI MOBILE)
    scrollToCategory(cat);
}
// 🔥 FUNGSI BARU: SCROLL HORIZONTAL KE KATEGORI TERTENTU
function scrollToCategory(catName) {
    const container = document.getElementById('categoryContainer');
    if (!container) return;

    // Cari tombol kategori yang sesuai
    const buttons = container.querySelectorAll('.cat-item');
    let targetBtn = null;
    buttons.forEach(btn => {
        if (btn.textContent.trim() === catName) {
            targetBtn = btn;
        }
    });

    if (!targetBtn) return;

    // Hitung posisi scroll agar tombol berada di tengah container
    const containerWidth = container.clientWidth;
    const btnLeft = targetBtn.offsetLeft;
    const btnWidth = targetBtn.offsetWidth;
    const scrollPosition = btnLeft - (containerWidth / 2) + (btnWidth / 2);

    // Scroll ke posisi yang dihitung
    container.scrollTo({
        left: Math.max(0, scrollPosition),
        behavior: 'smooth'
    });
}

function triggerGridAnimation() {
    const grid = document.getElementById('menuGrid');
    grid.classList.remove('menu-animate-enter');
    grid.classList.add('menu-animate-leave');
    setTimeout(() => {
        grid.classList.remove('menu-animate-leave');
        grid.classList.add('menu-animate-enter');
    }, 150);
}

// ======================== MENU ========================

async function renderMenu() {
    const grid = document.getElementById('menuGrid');
    const keyword = document.getElementById('searchInput').value.toLowerCase();
    const extraPrice = isOutsideJava(selectedOutlet) ? 2000 : 0;

    if (!supabaseClient || typeof supabaseClient.from !== 'function') {
        console.error('⚠️ Supabase belum siap!');
        grid.innerHTML = `<p class="text-center text-red-400 py-8">⚠️ Supabase belum siap. Refresh halaman.</p>`;
        return;
    }

    try {
        const { data: products, error } = await supabaseClient
            .from('products')
            .select('*')
            .eq('brand', selectedBrand);

        if (error) {
            console.error("Gagal mengambil menu:", error);
            grid.innerHTML = `<p class="text-center text-red-400 py-8">Gagal memuat menu.</p>`;
            return;
        }

        // 🔥 TAMBAHAN LOGIKA URUTAN: Menu yang ready (true) di atas, yang habis (false) otomatis ke bawah
        products.sort((a, b) => {
            const isAvailA = (a['status stok'] !== false && a.status_stok !== false);
            const isAvailB = (b['status stok'] !== false && b.status_stok !== false);
            
            // Jika status ketersediaannya berbeda, tempatkan yang ready (true) di atas
            if (isAvailA !== isAvailB) {
                return isAvailA ? -1 : 1;
            }
            
            // Jika status sama, urutkan berdasarkan sort_order (jika ada)
            const orderA = (a.sort_order !== null && a.sort_order !== undefined) ? Number(a.sort_order) : 999;
            const orderB = (b.sort_order !== null && b.sort_order !== undefined) ? Number(b.sort_order) : 999;
            return orderA - orderB;
        });

        const filtered = products.filter(item => {
            const matchCategory = (currentCategory === 'Semua' || item.category === currentCategory);
            const matchKeyword = item.name.toLowerCase().includes(keyword);
            return matchCategory && matchKeyword;
        });

        grid.innerHTML = filtered.map(item => {
            const presetDesc = getPresetForItem(item)?.desc || '';
            const itemDesc = item.description || item.desc || presetDesc;
            
            // Cek ketersediaan stok (menggunakan kolom status_stok sesuai database Supabase kamu)
            const isAvailable = item.is_available !== false; 
            const isPaketHematCard = item.category === 'Paket Hemat';
            const safeItemName = (item.name || '').replace(/'/g, "\'");
            const isDrinkAndFood = isBundlingDrinkAndFood(item);
            const shareBtnHtml = (isPaketHematCard && isDrinkAndFood) ? `
                <button type="button" onclick="event.stopPropagation(); openSharePaketHematModal({ id: ${item.id}, name: '${safeItemName}', category: '${item.category}' })" 
                    class="mt-1.5 w-full py-1 px-2 rounded-xl bg-amber-400/15 hover:bg-amber-400/30 border border-amber-400/50 text-amber-700 dark:text-amber-300 text-[9px] font-extrabold flex items-center justify-center gap-1 transition cursor-pointer">
                    <i class="fa-solid fa-share-nodes text-amber-500"></i> Share Diskon Rp2.000
                </button>
            ` : '';

            return `
            <div onclick="${isAvailable ? `openItemDetail(${item.id})` : `showOutOfStockWarning('${item.name}')`}" 
                 class="bg-white rounded-3xl border border-brand-100 p-3 shadow-sm hover:shadow-xl hover:-translate-y-1.5 transition-all duration-300 flex flex-col justify-between cursor-pointer group menu-item-card ${!isAvailable ? 'out-of-stock' : ''}">
                <div>
                    <div class="relative rounded-2xl overflow-hidden mb-2 aspect-square bg-gray-50/80 p-2 flex items-center justify-center">
                        ${!isAvailable ? '<span class="out-of-stock-badge">HABIS</span>' : ''}
                        <img src="${item.image_url}" alt="${item.name}" onerror="this.src='logo-ngopa-ngopi-ae.png'" class="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300">
                    </div>
                    <h4 class="font-extrabold text-xs md:text-sm text-brand-900 line-clamp-2 group-hover:text-amber-400 transition-colors">${item.name}</h4>
                    ${itemDesc ? `<p class="text-[10px] text-amber-600 dark:text-amber-400 font-semibold line-clamp-2 mt-0.5 leading-snug">${itemDesc}</p>` : ''}
                    <p class="text-[10px] text-gray-400 font-medium mt-0.5">${item.category}</p>
                    ${shareBtnHtml}
                </div>
                <div class="mt-3 flex items-center justify-between pt-2 border-t border-gray-100">
                    <p class="text-xs font-black text-brand-800">Rp${(item.price + extraPrice).toLocaleString('id-ID')}</p>
                    <div class="${isAvailable ? 'bg-brand-700 group-hover:bg-brand-500' : 'bg-gray-400'} text-white w-8 h-8 rounded-xl flex items-center justify-center transition-all shadow-sm">
                        <i class="fa-solid ${isAvailable ? 'fa-plus' : 'fa-xmark'} text-xs"></i>
                    </div>
                </div>
            </div>
        `;
        }).join('');
    } catch (err) {
        console.error('Error di renderMenu:', err);
        grid.innerHTML = `<p class="text-center text-red-400 py-8">Error: ${err.message}</p>`;
    }
}

function filterMenu() { renderMenu(); }

// ======================== ITEM DETAIL ========================

function getAvailableOptions(item) {
    const brand = item.brand;
    const cat = item.category;
    const name = item.name.toLowerCase();
    let options = { size: true, temp: true, ice: true, sugar: true };
    if (brand === 'Fore Coffee' && cat === 'Fore Junior') options.size = false;
    if (brand === 'Fore Coffee' && (cat === 'Fore Deli' || cat === 'Foreveryone 1L')) {
        options.size = false; options.temp = false; options.ice = false; options.sugar = false;
    }
    if (brand === 'Fore Coffee' && cat === 'Coffee' && (name === 'cappuccino' || name === 'caffe latte')) options.sugar = false;
    if (brand === 'Fore Coffee' && cat === 'Americano Series' && name === 'americano') options.sugar = false;
    return options;
}

async function openItemDetail(id) {
    if (!validateOutletSelection()) return;

    const { data: item, error } = await supabaseClient
        .from('products')
        .select('*')
        .eq('id', id)
        .single();

    if (error || !item) {
        console.error("Gagal mengambil detail menu:", error);
        showValidationAlert("Menu tidak ditemukan.");
        return;
    }

    if (item.category === 'Paket Hemat' && !item.name.toLowerCase().includes('ayam')) {
        openBundlingModal(item);
        return;
    }
    if (item.is_available === false) {
        showOutOfStockWarning(item.name);
        return;
    }

    const extraPrice = isOutsideJava(selectedOutlet) ? 2000 : 0;
    currentSelectedItem = { ...item, price: item.price + extraPrice };

    const availableOptions = getAvailableOptions(item);
    const isSnack = (item.category === 'Snack' || item.category === 'Nasi' || item.category === 'Korean Food' || item.category === 'Pasta' || item.category === 'Ayam Goreng' || (item.category === 'Paket Hemat' && item.name.toLowerCase().includes('ayam')) || (item.brand === 'Fore Coffee' && (item.category === 'Fore Deli' || item.category === 'Foreveryone 1L')));
    // Sembunyikan opsi untuk makanan
    document.getElementById('sizeSection').style.display = (isSnack || !availableOptions.size) ? 'none' : 'block';
    document.getElementById('tempSection').style.display = (isSnack || !availableOptions.temp) ? 'none' : 'block';
    document.getElementById('iceSection').style.display = (isSnack || !availableOptions.ice) ? 'none' : 'block';
    document.getElementById('sugarSection').style.display = (isSnack || !availableOptions.sugar) ? 'none' : 'block';
    const warningBox = document.getElementById('SnackStockWarning');
    if (warningBox) { if (isSnack) warningBox.classList.remove('hidden'); else warningBox.classList.add('hidden'); }

    document.getElementById('modalItemTitle').innerText = item.name;
    document.getElementById('modalItemNote').value = '';

    let largeUpcharge = 5000;
    if (item.brand === 'Fore Coffee') largeUpcharge = 7000;

    document.getElementById('sizeSection').style.display = (isSnack || !availableOptions.size) ? 'none' : 'block';
    document.getElementById('tempSection').style.display = (isSnack || !availableOptions.temp) ? 'none' : 'block';
    document.getElementById('iceSection').style.display = (isSnack || !availableOptions.ice) ? 'none' : 'block';
    document.getElementById('sugarSection').style.display = (isSnack || !availableOptions.sugar) ? 'none' : 'block';

    selectedCustomization = { size: 'Regular', sizeUpcharge: 0, temp: isSnack ? 'Warm' : 'Ice', sugar: isSnack ? 'Normal Sugar' : 'Normal Sugar', ice: isSnack ? 'No Ice' : 'Normal Ice' };

    const largeBtn = document.getElementById('opt-size-Large');
    const regBtn = document.getElementById('opt-size-Regular');
    if (largeBtn) { largeBtn.innerText = `Large (+${largeUpcharge.toLocaleString('id-ID')})`; largeBtn.onclick = function () { selectOption('size', 'Large', largeUpcharge); }; }
    if (regBtn) { regBtn.onclick = function () { selectOption('size', 'Regular', 0); }; }

    if (!availableOptions.size) { if (largeBtn) largeBtn.style.display = 'none'; if (regBtn) { regBtn.style.display = 'block'; selectedCustomization.size = 'Regular'; selectedCustomization.sizeUpcharge = 0; } } else { if (largeBtn) largeBtn.style.display = 'block'; if (regBtn) regBtn.style.display = 'block'; }

    if (!isSnack) {
        if (availableOptions.size) updateOptionUI('size', selectedCustomization.size);
        if (availableOptions.temp) updateOptionUI('temp', selectedCustomization.temp);
        if (availableOptions.sugar) updateOptionUI('sugar', selectedCustomization.sugar);
        if (availableOptions.ice) updateOptionUI('ice', selectedCustomization.ice);
    }

    const itemShareBox = document.getElementById('itemDetailSharePromoBox');
    if (itemShareBox) {
        if (item.category === 'Paket Hemat' && isBundlingDrinkAndFood(item)) itemShareBox.classList.remove('hidden');
        else itemShareBox.classList.add('hidden');
    }
    updateModalPriceHeaderAndButton();
    openModal('itemDetailModal');
}

function selectOption(category, value, upcharge) {
    selectedCustomization[category] = value;
    if (category === 'size') selectedCustomization.sizeUpcharge = upcharge;
    updateOptionUI(category, value);
    updateModalPriceHeaderAndButton();
}

function updateOptionUI(category, value) {
    document.querySelectorAll(`.${category}-btn`).forEach(btn => {
        btn.classList.remove('bg-amber-400', 'text-brand-900', 'border-amber-400');
        btn.classList.add('bg-brand-800', 'text-gray-300', 'border-brand-700');
    });
    const cleanValue = value.replace(/\s+/g, '');
    const activeBtn = document.getElementById(`opt-${category}-${cleanValue}`);
    if (activeBtn) {
        activeBtn.classList.remove('bg-brand-800', 'text-gray-300', 'border-brand-700');
        activeBtn.classList.add('bg-amber-400', 'text-brand-900', 'border-amber-400');
    }
}

function updateModalPriceHeaderAndButton() {
    if (!currentSelectedItem) return;
    const currentPrice = currentSelectedItem.price + selectedCustomization.sizeUpcharge;
    document.getElementById('modalItemPrice').innerText = `Rp${currentPrice.toLocaleString('id-ID')}`;
    document.getElementById('btnConfirmAdd').innerText = `Tambah`;
}

function confirmAddToCart() {
    if (!currentSelectedItem) return;
    const note = document.getElementById('modalItemNote').value.trim();
    const itemToAdd = { ...currentSelectedItem, brand: selectedBrand, size: selectedCustomization.size, sizeUpcharge: selectedCustomization.sizeUpcharge, temp: selectedCustomization.temp, sugar: selectedCustomization.sugar, ice: selectedCustomization.ice, note: note, cartItemId: Date.now() };
    flyToCart(currentSelectedItem.image_url);
    cart.push(itemToAdd);
    updateCartUI();
    closeModal('itemDetailModal');
    showToast("Item sudah dimasukkan ke keranjang");
}

function flyToCart(imgSrc) {
    const cartIcon = document.querySelector('[onclick*="cartModal"]');
    if (!cartIcon) return;
    const flyer = document.createElement('div');
    flyer.innerHTML = `<img src="${imgSrc || 'logo-ngopa-ngopi-ae.png'}" style="width:44px;height:44px;object-fit:contain;border-radius:50%;border:2px solid #2E6F40;background:white;box-shadow:0 4px 12px rgba(0,0,0,0.3);" />`;
    flyer.style.position = 'fixed';
    flyer.style.zIndex = '9999';
    flyer.style.left = '50%';
    flyer.style.top = '50%';
    flyer.style.transform = 'translate(-50%, -50%)';
    flyer.style.transition = 'all 0.6s cubic-bezier(0.2, 1, 0.3, 1)';
    document.body.appendChild(flyer);
    const cartRect = cartIcon.getBoundingClientRect();
    setTimeout(() => {
        flyer.style.left = `${cartRect.left + cartRect.width / 2}px`;
        flyer.style.top = `${cartRect.top + cartRect.height / 2}px`;
        flyer.style.transform = 'translate(-50%, -50%) scale(0.15) rotate(360deg)';
        flyer.style.opacity = '0.3';
    }, 20);
    setTimeout(() => flyer.remove(), 650);
}

function openBundlingModal(item) {
    const isPreset = getPresetForItem(item);

    if (isPreset && isPreset.items) {
        const bundleDescText = isPreset.desc || item.description || item.desc || '';
        activeBundlingItem = { ...item, price: item.price + (isOutsideJava(selectedOutlet) ? 2000 : 0) };
        
        bundlingSlots = isPreset.items.map((presetItem, idx) => {
            // Deteksi apakah ini makanan berdasarkan namanya
            const isFoodItem = /roti|toast|croissant|donut|snack|food|ayam|nasi|pasta|deli|choux|puff/i.test(presetItem.name);
            return {
                id: `preset-${idx}`,
                name: presetItem.name,
                size: isFoodItem ? '' : (presetItem.size !== undefined ? presetItem.size : 'Regular'),
                note: '',
                preset: true,
                slotIndex: idx
            };
        });

        activeSlotIndex = 0;

        document.getElementById('bundlingTitle').innerText = item.name;
        document.getElementById('bundlingSub').innerText = bundleDescText || '✨ Menu sudah dipilih otomatis!';
        document.getElementById('bundlingPrice').innerText = `Rp${activeBundlingItem.price.toLocaleString('id-ID')}`;

        document.getElementById('bundlingItemGrid').innerHTML = `
            <div class="col-span-4 text-center text-amber-400 text-xs py-4">
                <i class="fa-solid fa-check-circle text-lg"></i> Menu sudah dipilih otomatis untuk paket ini (Bisa diklik untuk melihat detail)
            </div>
        `;

        document.getElementById('bundlingCustomizeArea').classList.add('hidden');
        renderBundlingSlotsUI();
        
        const shareBox = document.getElementById('bundlingSharePromoBox');
        if (shareBox) {
            if (isBundlingDrinkAndFood(item)) shareBox.classList.remove('hidden');
            else shareBox.classList.add('hidden');
        }
        openModal('bundlingModal');
        return;
    }

    // 🔥 PAKET BIASA (manual select) - kode lama
    activeBundlingItem = { ...item, price: item.price + (isOutsideJava(selectedOutlet) ? 2000 : 0) };
    let totalSlots = item.slotCount || item.slot_count || 2;
    const pkgName = (item.name || '').toLowerCase();
    const pkgDesc = (item.description || item.desc || '').toLowerCase();

    if (pkgName.includes("3 cup") || pkgName.includes("satnight bertiga")) {
        totalSlots = 3;
    } else if (pkgName.includes("bundling drink & food")) {
        // Jika ada 3 item di deskripsi (dipisah |), maka 3 slot. Jika 4 item, 4 slot.
        const parts = pkgDesc.split('|');
        if (parts.length === 3) totalSlots = 3;
        else totalSlots = 4; // Default aman untuk bundling drink & food
    }
    
    bundlingSlots = Array(totalSlots).fill(null);
    activeSlotIndex = 0;

    document.getElementById('bundlingTitle').innerText = item.name;
    document.getElementById('bundlingSub').innerText = item.desc || 'Pilih item pilihanmu';
    document.getElementById('bundlingPrice').innerText = `Rp${activeBundlingItem.price.toLocaleString('id-ID')}`;

    const noteInput = document.getElementById('bundlingNoteInput');
    if (noteInput) {
        noteInput.value = '';
        noteInput.placeholder = `Catatan untuk Slot 1 (contoh: less ice, tanpa gula)...`;
    }

    const customArea = document.getElementById('bundlingCustomizeArea');
    if (customArea) customArea.classList.add('hidden');

    renderBundlingSlotsUI();
    renderBundleMenuOptions();
    const shareBox2 = document.getElementById('bundlingSharePromoBox');
    if (shareBox2) {
        if (isBundlingDrinkAndFood(item)) shareBox2.classList.remove('hidden');
        else shareBox2.classList.add('hidden');
    }
    openModal('bundlingModal');
}

function renderBundlingSlotsUI() {
    const container = document.getElementById('bundlingSlotsContainer');
    if (!container) return;
    container.style.display = 'flex';
    container.style.flexWrap = 'wrap';
    container.style.gap = '10px';

    container.innerHTML = bundlingSlots.map((slot, idx) => {
        const isActive = idx === activeSlotIndex;
        const isPreset = slot && slot.preset === true;

        let btnClass = "slot-btn rounded-2xl border text-left flex-1 transition-all duration-300 ";

        if (isActive && !slot) {
            btnClass += "bg-brand-800/40 text-amber-400 border-brand-700/50 active-slot slot-btn-empty";
        } else if (isActive && slot) {
            btnClass += "bg-amber-400 text-brand-900 border-amber-400 font-extrabold shadow-md active-slot";
        } else if (slot && isPreset) {
            btnClass += "bg-emerald-800/80 text-white border-emerald-600 shadow";
        } else if (slot) {
            btnClass += "bg-brand-800 text-white border-brand-700";
        } else {
            btnClass += "bg-brand-900/60 text-gray-400 border-brand-700/30 slot-btn-empty";
        }

        const noteDisplay = slot && slot.note ? `<span class="text-[9px] text-amber-300 block truncate font-medium">📝 ${slot.note}</span>` : '';
        const sizeDisplay = slot && slot.size ? ` (${slot.size})` : '';

        return `
            <button type="button" onclick="setActiveSlot(${idx})" class="${btnClass}">
                <div class="flex items-center justify-between">
                    <p class="text-[9px] uppercase tracking-wider font-bold opacity-80">Slot ${idx + 1}</p>
                    ${isPreset ? '<span class="text-[8px] bg-white/20 text-white px-1.5 py-0.2 rounded-full font-bold">Auto</span>' : ''}
                </div>
                <p class="text-xs truncate font-black mt-0.5">${slot ? slot.name + sizeDisplay : 'Pilih Item'}</p>
                ${noteDisplay}
            </button>
        `;
    }).join('');

    const btn = document.getElementById('btnConfirmBundling');
    if (btn) {
        const isComplete = bundlingSlots.every(s => s !== null);
        btn.innerText = isComplete ? 'Tambah ke Keranjang' : 'Tambah (Belum Lengkap)';
        btn.disabled = !isComplete;
        btn.className = isComplete
            ? "w-full bg-amber-400 hover:bg-amber-500 text-brand-950 font-extrabold py-3 rounded-2xl shadow-lg transition text-xs cursor-pointer"
            : "w-full bg-gray-600 text-gray-300 font-extrabold py-3 rounded-2xl cursor-not-allowed text-xs";
    }
}

async function setActiveSlot(index) {
    // Simpan catatan slot sebelumnya
    const noteInput = document.getElementById('bundlingNoteInput');
    if (noteInput && bundlingSlots[activeSlotIndex]) {
        bundlingSlots[activeSlotIndex].note = noteInput.value.trim();
    }

    activeSlotIndex = index;

    // Tampilkan catatan slot yang aktif
    if (noteInput) {
        const currentSlot = bundlingSlots[index];
        noteInput.value = currentSlot ? currentSlot.note || '' : '';

        const slotName = currentSlot ? currentSlot.name : `Slot ${index + 1}`;
        const sizeText = currentSlot && currentSlot.size ? ` (${currentSlot.size})` : '';
        noteInput.placeholder = `Catatan untuk ${slotName}${sizeText} (contoh: less sugar, panaskan)...`;
    }

    renderBundlingSlotsUI();

    // Jika bukan preset, render menu options
    const isPreset = bundlingSlots.every(s => s && s.preset === true);
    if (!isPreset) {
        await renderBundleMenuOptions();
    }
}

async function renderBundleMenuOptions() {
    const container = document.getElementById('bundlingItemGrid');
    if (!container) return;
    const targetBundle = activeBundlingItem;
    if (!targetBundle) return;
    const pkgName = (targetBundle.name || "").toLowerCase();
    const { data: products } = await supabaseClient
        .from('products')
        .select('*')
        .eq('brand', selectedBrand);
    const productList = products || [];
    let availableProducts = [];
    const cleanName = (str) => (str || "").toLowerCase().replace(/\s*\(.*?\)\s*/g, '').replace(/\s+/g, ' ').trim();
    const isExactMatch = (prod, targetList) => targetList.some(target => cleanName(prod.name) === cleanName(target));

    if (pkgName.includes("satnight berdua") || pkgName.includes("sat night berdua")) {
        availableProducts = productList.filter(p => isExactMatch(p, ["butterscotch aren latte", "creamy aren latte"]));
    } else if (pkgName.includes("satnight bertiga") || pkgName.includes("sat night bertiga")) {
        availableProducts = productList.filter(p => isExactMatch(p, ["pistachio aren latte", "creamy aren latte", "butterscotch aren latte"]));
    } else if (pkgName.includes("bundling 3 cup regular") || pkgName.includes("bundling 2 cup large")) {
        const allowedDrinks = ["kopi kenangan mantan", "spanish latte", "butterscotch aren latte", "toffee nut latte", "raspberry hibiscus", "pistachio aren latte", "og thai tea", "lemon black tea", "americano", "banana americano"];
        availableProducts = productList.filter(p => isExactMatch(p, allowedDrinks));
    } else if (pkgName.includes("bundling drink & food")) {
        // Untuk semua varian Bundling Drink & Food, slot 0 & 1 adalah Minuman, slot 2 & 3 adalah Roti/Snack
        if (activeSlotIndex <= 1) {
            const allowedDrinks = ["americano", "raspberry hibiscus", "kopi kenangan mantan", "cafe malt latte", "og thai tea"];
            availableProducts = productList.filter(p => isExactMatch(p, allowedDrinks));
        } else {
            const allowedSnacks = ["roti coklat klasik", "roti susu manis", "roti srikaya", "chocolate choux puff", "wahyu sapi toast", "salt bread choco butter"];
            availableProducts = productList.filter(p => isExactMatch(p, allowedSnacks));
        }
    } else if (pkgName.includes("paket hemat 1")) {
        if (activeSlotIndex === 0) availableProducts = productList.filter(p => isExactMatch(p, ["americano"]));
        else availableProducts = productList.filter(p => isExactMatch(p, ["chocolate croissant", "chocolate donut"]));
    } else if (pkgName.includes("paket hemat 2")) {
        if (activeSlotIndex === 0) availableProducts = productList.filter(p => isExactMatch(p, ["kopi kenangan mantan"]));
        else availableProducts = productList.filter(p => isExactMatch(p, ["roti coklat klasik", "roti susu manis"]));
    } else if (pkgName.includes("paket hemat 3")) {
        if (activeSlotIndex === 0) availableProducts = productList.filter(p => isExactMatch(p, ["dutch chocolate", "avocado milk"]));
        else availableProducts = productList.filter(p => isExactMatch(p, ["roti coklat klasik", "butter croissant", "sugar donut"]));
    } else if (pkgName.includes("couple mix regular")) {
        const allowedMixItems = ["kopi kenangan mantan", "spanish latte", "butterscotch aren latte", "toffee nut latte", "avocado milk", "babyccino", "raspberry hibiscus", "pistachio aren latte", "og thai tea", "lemon black tea", "americano", "banana americano"];
        availableProducts = productList.filter(p => isExactMatch(p, allowedMixItems));
    } else {
        availableProducts = productList;
    }

    if (availableProducts.length === 0) {
        availableProducts = productList;
    }

    container.innerHTML = availableProducts.map(prod => {
        const isSelected = bundlingSlots.some(slot => slot && slot.id === prod.id);
        return `
            <div onclick="selectBundlingItemForSlot('${prod.id}')" 
                 class="bundle-item-card cursor-pointer p-2 border rounded-xl transition text-center flex flex-col items-center justify-between relative 
                        ${isSelected ? 'selected border-amber-400 bg-amber-400/10' : 'border-brand-700 bg-brand-900 hover:border-amber-400'}">
                <img src="${prod.image_url}" alt="${prod.name}" class="w-full h-20 object-contain rounded-lg mb-1">
                <p class="text-xs text-white font-bold truncate w-full">${prod.name}</p>
                ${isSelected ? '<span class="absolute top-0 right-0 bg-amber-400 text-brand-900 text-[10px] font-black px-1.5 py-0.5 rounded-tr-lg rounded-bl-lg">✓</span>' : ''}
            </div>
        `;
    }).join('');
}

async function selectBundlingItemForSlot(id) {
    const { data: prod, error } = await supabaseClient
        .from('products')
        .select('*')
        .eq('id', id)
        .single();
    if (error || !prod) return;
    const noteInput = document.getElementById('bundlingNoteInput');
    const existingNote = (noteInput ? noteInput.value.trim() : '') || (bundlingSlots[activeSlotIndex]?.note || '');
    bundlingSlots[activeSlotIndex] = { id: prod.id, name: prod.name, cat: prod.category || '', note: existingNote };
    renderBundlingSlotsUI();
    await renderBundleMenuOptions();
    const nextEmptySlot = bundlingSlots.findIndex(s => s === null);
    if (nextEmptySlot !== -1) {
        setTimeout(() => setActiveSlot(nextEmptySlot), 300);
    } else {
        await renderBundleMenuOptions();
    }
}

async function confirmSlotSelection() {
    if (!tempSelectedSlotItem) return;
    bundlingSlots[activeSlotIndex] = { id: tempSelectedSlotItem.id, name: tempSelectedSlotItem.name, temp: document.getElementById('bundleTempSelect').value, sugar: document.getElementById('bundleSugarSelect').value, ice: document.getElementById('bundleIceSelect').value };
    document.getElementById('bundlingCustomizeArea').classList.add('hidden');
    const nextEmpty = bundlingSlots.findIndex(s => s === null);
    if (nextEmpty > -1) activeSlotIndex = nextEmpty;
    renderBundlingSlotsUI();
    await renderBundleMenuOptions();
}

function confirmAddBundlingToCart() {
    // Simpan catatan terakhir
    const noteInput = document.getElementById('bundlingNoteInput');
    if (noteInput && bundlingSlots[activeSlotIndex]) {
        bundlingSlots[activeSlotIndex].note = noteInput.value.trim();
    }

    const unfilled = bundlingSlots.findIndex(s => s === null);
    if (unfilled > -1) {
        alert(`Harap pilih menu untuk Slot ${unfilled + 1} terlebih dahulu!`);
        setActiveSlot(unfilled);
        return;
    }

    // Buat detail per slot dengan catatan masing-masing
    const slotDetailsStr = bundlingSlots.map((s, i) => {
        if (!s) return '';
        const sizeText = s.size ? ` (${s.size})` : '';
        const noteText = s.note ? ` 📝${s.note}` : '';
        return `Item ${i + 1}: ${s.name}${sizeText}${noteText}`;
    }).filter(Boolean).join(' | ');

    // ✅ PERBAIKAN: Kosongkan bundleDesc agar tidak tampil ganda di bawah nama paket 
    // (karena sudah terwakilkan secara lengkap oleh Detail Item di bawahnya)
    const bundleDescText = ""; 

    const bundleCartItem = {
        ...activeBundlingItem,
        brand: selectedBrand,
        size: 'Paket Bundling',
        sizeUpcharge: 0,
        temp: 'Multi',
        sugar: 'Multi',
        ice: 'Multi',
        bundleDesc: bundleDescText, // Dikosongkan agar bersih
        note: slotDetailsStr,
        slotDetails: bundlingSlots.map(s => ({
            name: s.name,
            size: s.size || '',
            note: s.note || ''
        })),
        cartItemId: Date.now()
    };

    flyToCart(activeBundlingItem.image_url || activeBundlingItem.img);
    cart.push(bundleCartItem);
    updateCartUI();
    closeModal('bundlingModal');
    showToast("Paket bundling berhasil ditambahkan ke keranjang!");
}

// ======================== CART ========================

function updateCartUI() {
    const groupedCart = [];
    cart.forEach(item => {
        // Buat key yang aman tanpa karakter spesial yang merusak pemanggilan fungsi
        const key = String(item.cartItemId || item.name);
        const existing = groupedCart.find(g => g.name === item.name && g.size === item.size && g.temp === item.temp && g.sugar === item.sugar && g.ice === item.ice && g.note === item.note);
        if (existing) { 
            existing.qty += 1; 
            existing.cartItemIds.push(item.cartItemId); 
        } else {
            groupedCart.push({ ...item, key: key, qty: 1, cartItemIds: [item.cartItemId] });
        }
    });

    const totalCount = cart.length;
    const cartCountEl = document.getElementById('cartCount');
    const mobileCartBadgeEl = document.getElementById('mobileCartBadge');
    if (cartCountEl) {
        cartCountEl.innerText = totalCount;
        cartCountEl.classList.toggle('hidden', totalCount === 0);
    }
    if (mobileCartBadgeEl) {
        mobileCartBadgeEl.innerText = totalCount;
        mobileCartBadgeEl.classList.toggle('hidden', totalCount === 0);
    }

    const container = document.getElementById('cartItems');
    if (!container) return;

    if (groupedCart.length === 0) {
        container.innerHTML = `<p class="text-center text-xs text-gray-400 py-6">Keranjangmu masih kosong!.</p>`;
    } else {
        container.innerHTML = groupedCart.map((item, i) => {
            const itemPrice = item.price + (item.sizeUpcharge || 0);

            const isSnack = ['Snack', 'Nasi', 'Korean Food', 'Pasta', 'Ayam Goreng'].includes(item.category) ||
                (item.category === 'Paket Hemat' && item.name.toLowerCase().includes('ayam')) ||
                (item.brand === 'Fore Coffee' && (item.category === 'Fore Deli' || item.category === 'Foreveryone 1L'));
            const isBundle = (item.category === 'Paket Hemat' && !item.name.toLowerCase().includes('ayam'));
            const isForeJunior = (item.brand === 'Fore Coffee' && item.category === 'Fore Junior');

            let detailHtml = '';
            if (isBundle && item.bundleDesc) {
                detailHtml += `<p class="text-[10px] font-bold text-amber-600 dark:text-amber-400 mt-0.5">${item.bundleDesc}</p>`;
            }
            if (!isSnack && !isBundle) {
                let sizeText = isForeJunior ? '' : ` | Ukuran: ${item.size}`;
                let tempText = item.temp === 'Ice' ? 'Dingin' : (item.temp === 'Hot' ? 'Panas' : (item.temp || '-'));
                let sugarText = item.sugar ? (item.sugar === 'Normal Sugar' ? 'Normal Gula' : (item.sugar === 'Less Sugar' ? 'Sedikit Gula' : (item.sugar === 'No Sugar' ? 'Tanpa Gula' : (item.sugar || '-')))) : '';
                let iceText = item.ice ? (item.ice === 'Normal Ice' ? 'Normal Es' : (item.ice === 'Less Ice' ? 'Sedikit Es' : (item.ice === 'No Ice' ? 'Tanpa Es' : (item.ice || '-')))) : '';
                detailHtml = `<p class="text-[10px] text-gray-500 mt-0.5">Temp: ${tempText}${sugarText ? ` | Gula: ${sugarText}` : ''}${iceText ? ` | Es: ${iceText}` : ''}${sizeText}</p>`;
            }
            if (item.note) detailHtml += `<p class="text-[10px] text-gray-500 mt-0.5">📝 ${item.note}</p>`;

            // Gunakan cartItemId pertama dari group untuk tombol plus/minus/hapus yang dijamin 100% akurat & responsif
            const firstId = item.cartItemIds[0];

            return `
        <div class="flex items-center justify-between bg-brand-50 p-2.5 rounded-2xl border border-brand-100 text-xs relative mb-2">
            <div class="flex-1 pr-2">
                <p class="font-extrabold text-brand-950 dark:text-white">${i + 1}. ${item.name} ${!isForeJunior && item.size && (item.category === 'Kopi' || item.category === 'Non-Kopi') ? `(${item.size})` : ''}</p>
                ${detailHtml}
                <p class="font-black text-brand-900 dark:text-amber-400 mt-1">Rp${(itemPrice * item.qty).toLocaleString('id-ID')}</p>
            </div>
            <div class="flex flex-col items-end gap-1">
                <div class="flex items-center gap-1.5 bg-white rounded-full shadow-sm px-1 py-1 border border-gray-200">
                    <button type="button" class="qty-btn qty-btn-minus" onclick="changeItemQty(${firstId}, -1)">-</button>
                    <span class="font-black text-brand-900 text-sm w-5 text-center">${item.qty}</span>
                    <button type="button" class="qty-btn qty-btn-plus" onclick="changeItemQty(${firstId}, 1)">+</button>
                </div>
                <button type="button" onclick="removeGroupedItem(${firstId})" class="text-red-500 hover:text-red-700 text-[10px] font-bold mt-1 cursor-pointer">Hapus</button>
            </div>
        </div>
    `;
        }).join('');
    }

    let subtotal = 0;
    cart.forEach(item => { subtotal += (item.price + (item.sizeUpcharge || 0)); });
    let jasdorFee = 0;
    cart.forEach(item => { jasdorFee += (item.category === 'Paket Hemat' ? 750 : 500); });

    const redeemSec = document.getElementById('redeemPointSection');
    const pointRow = document.getElementById('pointDiscountRow');
    let pointDiscount = 0;

    const methodSelect = document.getElementById('orderMethod');
    const method = methodSelect ? methodSelect.value : 'Pickup';
    let deliveryAndBagTotal = 0;
    const rowEl = document.getElementById('deliveryFeeRow');
    const labelEl = document.getElementById('deliveryFeeLabel');
    const valEl = document.getElementById('deliveryFeeVal');

    if (method === 'Ojol') {
        deliveryAndBagTotal = 17000;
        if (rowEl) rowEl.classList.remove('hidden');
        if (labelEl) labelEl.innerText = "Biaya Delivery Ojol Maks 4 km + Bag:";
        if (valEl) valEl.innerText = `Rp${deliveryAndBagTotal.toLocaleString('id-ID')}`;
    } else if (method === 'NgopaNgopi') {
        deliveryAndBagTotal = 8000;
        if (rowEl) rowEl.classList.remove('hidden');
        if (labelEl) labelEl.innerText = "Biaya Delivery Tim NgopaNgopi:";
        if (valEl) valEl.innerText = `Rp${deliveryAndBagTotal.toLocaleString('id-ID')}`;
    } else {
        if (rowEl) rowEl.classList.add('hidden');
    }

    // 🔥 KONVERSI POIN & DISKON TRANSAKSI KHUSUS FORE COFFEE (10% DARI NILAI NORMAL)
    const isFore = (typeof isForeCoffeeSelected === 'function') ? isForeCoffeeSelected() : (selectedBrand === 'Fore Coffee');
    const convFactor = isFore ? 0.1 : 1;

    // 🔥 HITUNG DISKON NGOPA LOYALTY CARD BERJENJANG
    const loyaltyRow = document.getElementById('loyaltyDiscountRow');
    let activeLoyaltyDiscount = 0;
    const rawLoyaltyDisc = (typeof currentLoyaltyDiscount !== 'undefined' && currentLoyaltyDiscount > 0) ? currentLoyaltyDiscount : 0;
    const effectiveLoyaltyDisc = Math.floor(rawLoyaltyDisc * convFactor);

    if (effectiveLoyaltyDisc > 0 && cart.length > 0) {
        activeLoyaltyDiscount = Math.min(effectiveLoyaltyDisc, subtotal + jasdorFee + deliveryAndBagTotal);
        if (loyaltyRow) loyaltyRow.classList.remove('hidden');
        const lvlLabel = document.getElementById('loyaltyLevelLabel');
        const lvlVal = document.getElementById('loyaltyDiscountVal');
        if (lvlLabel) lvlLabel.innerText = `${currentLoyaltyLevelObj ? currentLoyaltyLevelObj.icon + ' ' + currentLoyaltyLevelObj.level : 'Loyalty'} • ${currentCustomerOrderCount}x Order${isFore ? ' • Konversi Fore 10%' : ''}`;
        if (lvlVal) lvlVal.innerText = `-Rp${activeLoyaltyDiscount.toLocaleString('id-ID')}`;
    } else {
        if (loyaltyRow) loyaltyRow.classList.add('hidden');
    }

    // 🔥 HITUNG DISKON SHARE PAKET HEMAT (RP 2.000 UNTUK 1 PCS BUNDLING DRINK & FOOD, MAKS 1X PER AKUN)
    const hasPaketHematInCart = cart.some(c => c.category === 'Paket Hemat' && isBundlingDrinkAndFood(c));
    const shareCartSection = document.getElementById('cartSharePaketHematSection');
    const shareDiscRow = document.getElementById('sharePaketHematDiscountRow');
    const shareSubtext = document.getElementById('cartShareStatusSubtext');
    const shareBtnEl = document.getElementById('btnCartShareToggle');
    let sharePaketDiscount = 0;

    if (hasPaketHematInCart) {
        if (shareCartSection) shareCartSection.classList.remove('hidden');
        if (typeof hasAccountUsedSharePromo !== 'undefined' && hasAccountUsedSharePromo) {
            if (shareSubtext) shareSubtext.innerText = "Jatah promo Share Paket Hemat (1x/Akun) sudah pernah digunakan.";
            if (shareBtnEl) {
                shareBtnEl.innerText = "Sudah Dipakai";
                shareBtnEl.className = "px-3 py-1.5 bg-gray-400 text-white font-black rounded-xl text-[10px] shrink-0 cursor-not-allowed";
            }
            if (shareDiscRow) shareDiscRow.classList.add('hidden');
        } else if (typeof isSharePaketHematDiscountActive !== 'undefined' && isSharePaketHematDiscountActive) {
            sharePaketDiscount = Math.min(2000, Math.max(0, subtotal + jasdorFee + deliveryAndBagTotal - activeLoyaltyDiscount));
            if (shareDiscRow) shareDiscRow.classList.remove('hidden');
            const shareDiscValEl = document.getElementById('sharePaketHematDiscountVal');
            if (shareDiscValEl) shareDiscValEl.innerText = `-Rp${sharePaketDiscount.toLocaleString('id-ID')}`;
            if (shareSubtext) shareSubtext.innerText = "✓ Bukti share terverifikasi! Diskon Rp2.000 (1 pcs) aktif.";
            if (shareBtnEl) {
                shareBtnEl.innerText = "✓ Aktif (-Rp2.000)";
                shareBtnEl.className = "px-3 py-1.5 bg-amber-400 text-brand-900 font-black rounded-xl text-[10px] shrink-0 cursor-pointer";
            }
        } else {
            if (shareDiscRow) shareDiscRow.classList.add('hidden');
            if (shareSubtext) shareSubtext.innerText = "Share link Paket Hemat & upload bukti foto.";
            if (shareBtnEl) {
                shareBtnEl.innerText = "Share & Klaim";
                shareBtnEl.className = "px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-xl text-[10px] transition shadow shrink-0 cursor-pointer";
            }
        }
    } else {
        if (shareCartSection) shareCartSection.classList.add('hidden');
        if (shareDiscRow) shareDiscRow.classList.add('hidden');
    }

    const remainingAfterLoyaltyAndShare = Math.max(0, subtotal + jasdorFee + deliveryAndBagTotal - activeLoyaltyDiscount - sharePaketDiscount);

    if (typeof loggedInCustomer !== 'undefined' && loggedInCustomer && loggedInCustomer.points > 0) {
        if (redeemSec) redeemSec.classList.remove('hidden');
        const rawPts = Number(loggedInCustomer.points) || 0;
        const convertedMaxPts = Math.floor(rawPts * convFactor);
        const availPtsEl = document.getElementById('cartAvailablePoints');
        if (availPtsEl) {
            availPtsEl.innerText = isFore
                ? `${rawPts.toLocaleString('id-ID')} (Konversi Fore 10% = ${convertedMaxPts.toLocaleString('id-ID')}`
                : rawPts.toLocaleString('id-ID');
        }

        if (typeof isUsingPoints !== 'undefined' && isUsingPoints && convertedMaxPts > 0) {
            pointDiscount = Math.min(convertedMaxPts, remainingAfterLoyaltyAndShare);
            const rawPointsUsed = isFore ? Math.min(rawPts, pointDiscount * 10) : pointDiscount;
            if (pointRow) pointRow.classList.remove('hidden');
            const usedPtsEl = document.getElementById('usedPointsLabel');
            const ptValEl = document.getElementById('pointDiscountVal');
            if (usedPtsEl) {
                usedPtsEl.innerText = isFore
                    ? `${rawPointsUsed.toLocaleString('id-ID')} ➔ ${pointDiscount.toLocaleString('id-ID')}`
                    : pointDiscount.toLocaleString('id-ID');
            }
            if (ptValEl) ptValEl.innerText = `-Rp${pointDiscount.toLocaleString('id-ID')}`;
        } else {
            if (pointRow) pointRow.classList.add('hidden');
        }
    } else {
        if (redeemSec) redeemSec.classList.add('hidden');
        if (pointRow) pointRow.classList.add('hidden');
    }

    const grandTotal = Math.max(0, subtotal + jasdorFee + deliveryAndBagTotal - activeLoyaltyDiscount - sharePaketDiscount - pointDiscount);

    // 🔥 ESTIMASI BENEFIT CASHBACK POIN BERDASARKAN LEVEL AKUN (1%, 3%, 5%)
    const cbRow = document.getElementById('cashbackPointEstimateRow');
    const cbRate = typeof getCashbackRateForCurrentLevel === 'function' ? getCashbackRateForCurrentLevel() : 0;
    if (cbRow) {
        if (cbRate > 0 && grandTotal > 0) {
            const estPoints = Math.floor(grandTotal * cbRate);
            cbRow.classList.remove('hidden');
            const cbRateLbl = document.getElementById('cashbackRateLabel');
            const cbValEl = document.getElementById('cashbackPointEstimateVal');
            if (cbRateLbl) cbRateLbl.innerText = `${currentAccountSpendInfo?.currentTier?.level || ''} ${Math.round(cbRate * 100)}%`;
            if (cbValEl) cbValEl.innerText = `+${estPoints.toLocaleString('id-ID')} Poin (Exp 2 Bln)`;
        } else {
            cbRow.classList.add('hidden');
        }
    }

    const subtotalEl = document.getElementById('subtotalPrice');
    const jasdorEl = document.getElementById('jasdorFee');
    const grandTotalEl = document.getElementById('grandTotal');

    if (subtotalEl) subtotalEl.innerText = `Rp${subtotal.toLocaleString('id-ID')}`;
    if (jasdorEl) jasdorEl.innerText = `Rp${jasdorFee.toLocaleString('id-ID')}`;
    if (grandTotalEl) grandTotalEl.innerText = `Rp${grandTotal.toLocaleString('id-ID')}`;

    const floatCart = document.getElementById('floatingCart');
    if (floatCart) {
        const countEl = document.getElementById('floatingCartCount');
        const totalEl = document.getElementById('floatingCartTotal');

        if (countEl) countEl.textContent = totalCount + ' Menu';
        if (totalEl) totalEl.textContent = `Rp${grandTotal.toLocaleString('id-ID')}`;

        if (totalCount > 0) {
            floatCart.classList.add('visible');
        } else {
            floatCart.classList.remove('visible');
        }
    }
}

function changeItemQty(cartItemId, delta) {
    const targetItem = cart.find(c => c.cartItemId === Number(cartItemId));
    if (!targetItem) return;

    if (delta > 0) {
        const newItem = { ...targetItem, cartItemId: Date.now() + Math.random() };
        cart.push(newItem);
    } else if (delta < 0) {
        const index = cart.findIndex(c => c.cartItemId === Number(cartItemId));
        if (index > -1) {
            cart.splice(index, 1);
        }
    }
    updateCartUI();
}

function removeGroupedItem(cartItemId) {
    // Hapus semua item yang memiliki kriteria mirip atau berdasarkan cartItemId unik
    const targetItem = cart.find(c => c.cartItemId === Number(cartItemId));
    if (!targetItem) return;

    cart = cart.filter(c => !(
        c.name === targetItem.name &&
        c.size === targetItem.size &&
        c.temp === targetItem.temp &&
        c.sugar === targetItem.sugar &&
        c.ice === targetItem.ice &&
        c.note === targetItem.note
    ));
    updateCartUI();
    showToast("Item berhasil dihapus dari keranjang");
}

// ======================== DELIVERY TOGGLE ========================

function toggleDeliveryFields() {
    const methodSelect = document.getElementById('orderMethod');
    if (!methodSelect) return;
    const method = methodSelect.value;
    const addressSec = document.getElementById('deliveryAddressSection');
    const infoText = document.getElementById('deliveryInfoText');
    if (method === 'Ojol') {
        if (addressSec) addressSec.classList.remove('hidden');
        if (infoText) infoText.innerText = "Biaya Delivery Maks 4 km (Rp11.000) + Bag Fee (Rp6.000) ditambahkan otomatis.";
    } else if (method === 'NgopaNgopi') {
        if (addressSec) addressSec.classList.remove('hidden');
        if (infoText) infoText.innerText = "Biaya Delivery Tim NgopaNgopiAe (Rp8.000) ditambahkan otomatis.";
    } else {
        if (addressSec) addressSec.classList.add('hidden');
        const addrInput = document.getElementById('deliveryAddress');
        if (addrInput) addrInput.value = '';
    }
    updateCartUI();
}

// ======================== ORDER VIA WA ========================

async function submitOrderViaWA() {
    if (cart.length === 0) {
        showValidationAlert("Keranjangmu masih kosong! Silakan pilih menu terlebih dahulu.");
        return;
    }

    const name = document.getElementById('custName').value.trim();
    const phone = document.getElementById('custPhone').value.trim();
    const pickupHour = document.getElementById('pickupHour')?.value || '20';
    const pickupMinute = document.getElementById('pickupMinute')?.value || '05';
    const pickupTime = pickupHour + '.' + pickupMinute;
    const timeZone = document.getElementById('optTimeZone').value;
    const methodSelect = document.getElementById('orderMethod');
    const method = methodSelect ? methodSelect.value : 'Pickup';

    if (!name) {
        showValidationAlert("Nama wajib diisi sebelum mengirim pesanan ke admin!");
        document.getElementById('custName').focus();
        return;
    }

    if (!phone) {
        showValidationAlert("Nomor HP wajib diisi sebelum mengirim pesanan ke admin!");
        document.getElementById('custPhone').focus();
        return;
    }

    if (!pickupTime) {
        showValidationAlert("Waktu pickup wajib diisi (Contoh: 12.05)!");
        document.getElementById('optPickupTime').focus();
        return;
    }

    let deliveryAndBagCost = 0;
    let deliveryDetailStr = "%0A*METODE:* Pickup (Ambil sendiri di Outlet)";

    if (method === 'Ojol') {
        const address = document.getElementById('deliveryAddress').value.trim();

        if (!address) {
            showToast("Alamat lengkap pengiriman wajib diisi untuk metode Delivery!");
            document.getElementById('deliveryAddress').focus();
            return;
        }

        deliveryAndBagCost = 17000;
        deliveryDetailStr =
            "%0A*METODE:* Delivery (Diantar Ojol ke Alamat)" +
            "%0A*ALAMAT KIRIM:* " +
            encodeURIComponent(address);

    } else if (method === 'NgopaNgopi') {
        const address = document.getElementById('deliveryAddress').value.trim();

        if (!address) {
            showToast("Alamat lengkap pengiriman wajib diisi untuk metode Delivery!");
            document.getElementById('deliveryAddress').focus();
            return;
        }

        deliveryAndBagCost = 8000;
        deliveryDetailStr =
            "%0A*METODE:* Delivery (Diantar Tim NgopaNgopiAe)" +
            "%0A*ALAMAT KIRIM:* " +
            encodeURIComponent(address);
    }

    const outletName = selectedOutlet
        ? selectedOutlet.name
        : 'Outlet tidak dipilih';


    // =====================================================
    // PEMBENTUKAN RINCIAN MENU UNTUK WHATSAPP
    // =====================================================

    let menuStr = cart.map((c, i) => {

        const itemPrice = c.price + (c.sizeUpcharge || 0);

        // Gunakan category, BUKAN cat
        const category = String(
            c.category || c.cat || ''
        ).trim();


        // =================================================
        // KATEGORI MAKANAN
        // =================================================

        const foodCategories = [
            'Ayam Goreng',
            'Pasta',
            'Nasi',
            'Snack',
            'Korean Food',
            'Fore Deli'
        ];

        const isFoodCategory = foodCategories.includes(category);


        // Paket Ayam yang berada di kategori Paket Hemat
        const isPaketAyam =
            category === 'Paket Hemat' &&
            c.name &&
            c.name.toLowerCase().includes('paket ayam');


        // Foreveryone 1L juga tidak membutuhkan
        // ukuran / temperatur / gula / es
        const isForeveryone1L =
            c.brand === 'Fore Coffee' &&
            category === 'Foreveryone 1L';


        const isFood =
            isFoodCategory ||
            isPaketAyam ||
            isForeveryone1L;


        // =================================================
        // BUNDLING BIASA
        // =================================================

        const isBundle =
            category === 'Paket Hemat' &&
            !(
                c.name &&
                c.name.toLowerCase().includes('paket ayam')
            );


        // =================================================
        // FORE JUNIOR
        // =================================================

        const isForeJunior =
            c.brand === 'Fore Coffee' &&
            category === 'Fore Junior';


        // =================================================
        // MAKANAN
        // HANYA MENU + CATATAN + SUBTOTAL
        // =================================================

        if (isFood) {

            let extraDetails = '';

            // Khusus paket ayam yang memiliki slotDetails
            if (isPaketAyam && c.slotDetails) {

                const slotDetails = c.slotDetails
                    .map((s, idx) =>
                        `Slot ${idx + 1}: ${s.name}` +
                        `${s.size ? ` (${s.size})` : ''}` +
                        `${s.note ? ` (Catatan: ${s.note})` : ''}`
                    )
                    .join(' | ');

                extraDetails =
                    `%0ADetail Paket: ${slotDetails}`;
            }


            // Catatan tambahan
            const noteText = c.note
                ? `%0ACatatan Tambahan: ${encodeURIComponent(c.note)}`
                : '';


            return (
                (i + 1) +
                ". Menu: " +
                c.name +
                extraDetails +
                noteText +
                "%0ASubtotal: Rp" +
                itemPrice.toLocaleString('id-ID')
            );
        }


        // =================================================
        // BUNDLING BIASA
        // =================================================

        // =================================================
        // BUNDLING BIASA & BUNDLING DRINK & FOOD (Baris 2152-2189)
        // =================================================

        if (isBundle) {
            // ✅ PERBAIKAN: Hanya gunakan nama paket murni tanpa tambahan teks/deskripsi item di dalam kurung
            const menuTitle = c.name;

            let slotDetailsFormatted = '';
            if (c.slotDetails && Array.isArray(c.slotDetails)) {
                const slotsStr = c.slotDetails
                    .map((s, idx) =>
                        `Item ${idx + 1}: ${s.name}` +
                        `${s.size ? ` (${s.size})` : ''}` +
                        `${s.note ? ` [Catatan: ${s.note}]` : ''}`
                    )
                    .join(' | ');
                slotDetailsFormatted = `%0ADetail Item: ${encodeURIComponent(slotsStr)}`;
            } else if (c.note) {
                slotDetailsFormatted = `%0ADetail Item: ${encodeURIComponent(c.note)}`;
            }

            return (
                (i + 1) +
                ". Menu: " +
                encodeURIComponent(menuTitle) +
                slotDetailsFormatted +
                "%0ASubtotal: Rp" +
                itemPrice.toLocaleString('id-ID')
            );
        }


        // =================================================
        // MINUMAN
        // HANYA BAGIAN INI YANG MENAMPILKAN
        // SIZE / TEMP / GULA / ES
        // =================================================

        let tempText = c.temp || '-';
        if (c.temp === 'Ice') tempText = 'Dingin';
        if (c.temp === 'Hot') tempText = 'Panas';


        let sugarText = c.sugar || '-';
        if (c.sugar === 'Normal Sugar') sugarText = 'Normal Gula';
        if (c.sugar === 'Less Sugar') sugarText = 'Sedikit Gula';
        if (c.sugar === 'No Sugar') sugarText = 'Tanpa Gula';


        let iceText = c.ice || '-';
        if (c.ice === 'Normal Ice') iceText = 'Normal Es';
        if (c.ice === 'Less Ice') iceText = 'Sedikit Es';
        if (c.ice === 'No Ice') iceText = 'Tanpa Es';


        const sizeText = isForeJunior
            ? ''
            : `Ukuran: ${c.size || '-'}%0A`;


        return (
            (i + 1) +
            ". Menu: " +
            c.name +
            "%0A" +
            sizeText +
            "Temperatur: " +
            tempText +
            "%0A" +
            "Takaran Gula: " +
            sugarText +
            "%0A" +
            "Takaran Es: " +
            iceText +
            "%0A" +
            "Catatan: " +
            encodeURIComponent(c.note || '-') +
            "%0A" +
            "Subtotal: Rp" +
            itemPrice.toLocaleString('id-ID')
        );

    }).join('%0A%0A');


    // =====================================================
    // TOTAL
    // =====================================================

    // Pastikan sinkronisasi jumlah order & diskon Loyalty Card terbaru dari Supabase berdasarkan Nomor HP
    await syncCustomerLoyaltyDiscount(phone);

    const subtotalVal = cart.reduce((acc, item) => acc + item.price + (item.sizeUpcharge || 0), 0);
    let jasdorFeeTotal = 0;
    cart.forEach(item => { jasdorFeeTotal += (item.category === 'Paket Hemat' ? 750 : 500); });

    // 🔥 KONVERSI POIN & DISKON TRANSAKSI KHUSUS FORE COFFEE (10% DARI NILAI NORMAL)
    const isForeOrder = (typeof isForeCoffeeSelected === 'function') ? isForeCoffeeSelected() : (selectedBrand === 'Fore Coffee');
    const convFactorOrder = isForeOrder ? 0.1 : 1;

    // 🔥 HITUNG DISKON NGOPA LOYALTY CARD BERJENJANG
    let loyaltyDiscountVal = 0;
    const effectiveLoyaltyDiscOrder = Math.floor((currentLoyaltyDiscount || 0) * convFactorOrder);
    if (effectiveLoyaltyDiscOrder > 0) {
        loyaltyDiscountVal = Math.min(effectiveLoyaltyDiscOrder, subtotalVal + jasdorFeeTotal + deliveryAndBagCost);
    }

    // 🔥 HITUNG DISKON SHARE PAKET HEMAT (1 PCS = RP 2.000, JATAH 1X PER AKUN)
    await checkHasCustomerUsedSharePromo(phone);
    const hasPaketHematInCart = cart.some(c => c.category === 'Paket Hemat');
    let sharePaketDiscountVal = 0;
    if (isSharePaketHematDiscountActive && !hasAccountUsedSharePromo && hasPaketHematInCart) {
        sharePaketDiscountVal = Math.min(2000, Math.max(0, subtotalVal + jasdorFeeTotal + deliveryAndBagCost - loyaltyDiscountVal));
    }

    // 🔥 HITUNG POIN DISCOUNT
    let pointDiscountVal = 0;
    let usedPointsCount = 0;
    let convertedPointsUsed = 0;
    if (loggedInCustomer && isUsingPoints && loggedInCustomer.points > 0) {
        const preTotal = Math.max(0, subtotalVal + jasdorFeeTotal + deliveryAndBagCost - loyaltyDiscountVal - sharePaketDiscountVal);
        const rawAvailPts = Number(loggedInCustomer.points) || 0;
        const maxConvertedPts = Math.floor(rawAvailPts * convFactorOrder);
        pointDiscountVal = Math.min(maxConvertedPts, preTotal);
        convertedPointsUsed = pointDiscountVal;
        usedPointsCount = isForeOrder ? Math.min(rawAvailPts, pointDiscountVal * 10) : pointDiscountVal;
    }

    const grandTotalVal = Math.max(0, subtotalVal + jasdorFeeTotal + deliveryAndBagCost - loyaltyDiscountVal - sharePaketDiscountVal - pointDiscountVal);

    // 🔥 HITUNG BENEFIT CASHBACK POIN LEVEL AKUN (1%, 3%, 5%)
    const cashbackRate = typeof getCashbackRateForCurrentLevel === 'function' ? getCashbackRateForCurrentLevel() : 0;
    const earnedCashbackPoints = cashbackRate > 0 ? Math.floor(grandTotalVal * cashbackRate) : 0;


    // =====================================================
    // FORMAT PESAN WHATSAPP
    // =====================================================

    let text =
        "*Hai min aku mau pesan ya*%0A%0A";

    text +=
        "*BRAND:* " +
        selectedBrand +
        "%0A";

    text +=
        "*NAMA:* " +
        name +
        "%0A";

    text +=
        "*NOMOR HP:* " +
        phone +
        "%0A";

    text +=
        "*OUTLET:* " +
        outletName +
        deliveryDetailStr +
        "%0A";

    text +=
        "*WAKTU PICKUP:* " +
        pickupTime +
        " " +
        timeZone +
        "%0A%0A";

    text +=
        "*RINCIAN PESANAN:*%0A" +
        menuStr +
        "%0A%0A";

    text +=
        "*SUBTOTAL MENU:* Rp" +
        subtotalVal.toLocaleString('id-ID') +
        "%0A";

    text +=
        "*FEE JASDOR:* Rp" +
        jasdorFeeTotal.toLocaleString('id-ID') +
        "%0A";
    if (loyaltyDiscountVal > 0 && currentLoyaltyLevelObj) {
        text += "*DISKON LOYALTY (" + currentLoyaltyLevelObj.level + " - Order ke-" + (currentCustomerOrderCount + 1) + (isForeOrder ? " - Konversi Fore 10%" : "") + "):* -Rp" + loyaltyDiscountVal.toLocaleString('id-ID') + "%0A";
    }
    if (sharePaketDiscountVal > 0) {
        text += "*DISKON SHARE PAKET HEMAT (1 pcs - Bukti Foto Terlampir):* -Rp" + sharePaketDiscountVal.toLocaleString('id-ID') + "%0A";
    }
    if (pointDiscountVal > 0) {
        const pointLabelWA = isForeOrder ? `${usedPointsCount} poin -> konversi Fore ${convertedPointsUsed} poin` : `${usedPointsCount} poin`;
        text += "*DISKON POIN (" + pointLabelWA + "):* -Rp" + pointDiscountVal.toLocaleString('id-ID') + "%0A";
    }

    if (method === 'Ojol') {

        text +=
            "*BIAYA DELIVERY OJOL + BAG:* Rp" +
            deliveryAndBagCost.toLocaleString('id-ID') +
            "%0A";

    } else if (method === 'NgopaNgopi') {

        text +=
            "*BIAYA DELIVERY TIM NGOPANGOPI:* Rp" +
            deliveryAndBagCost.toLocaleString('id-ID') +
            "%0A";
    }

    text +=
        "*TOTAL PEMBAYARAN:* Rp" +
        grandTotalVal.toLocaleString('id-ID') +
        "%0A";
    if (earnedCashbackPoints > 0) {
        text += "*CASHBACK POIN LEVEL (" + Math.round(cashbackRate * 100) + "%):* +" + earnedCashbackPoints.toLocaleString('id-ID') + " Poin (Berlaku 2 Bulan)%0A";
    }
    text += "%0ATolong kirimin QRIS / Rekening Pembayaran dong min. Terima kasih!";


    // =====================================================
    // SIAPKAN PAYLOAD ORDER KE SUPABASE (DENGAN FALLBACK AMAN)
    // =====================================================

    const baseOrderData = {
        customer_name: name,
        customer_phone: phone,
        total_price: grandTotalVal,
        status: 'Pesanan Diterima',
        points_earned: earnedCashbackPoints,
        items: cart.map((item, idx) => ({
            index: idx + 1,
            name: item.name,
            brand: item.brand || selectedBrand,
            category: item.category || item.cat || '',
            size: item.size || '',
            temp: item.temp || '',
            sugar: item.sugar || '',
            ice: item.ice || '',
            note: item.note || '',
            price: item.price + (item.sizeUpcharge || 0)
        })),
        notes: `Metode: ${method} | Outlet: ${outletName}${loyaltyDiscountVal > 0 ? ` | Loyalty: ${currentLoyaltyLevelObj?.level} (-Rp${loyaltyDiscountVal})` : ''}${sharePaketDiscountVal > 0 ? ` | SHARE_PAKET_HEMAT (-Rp${sharePaketDiscountVal})` : ''}${pointDiscountVal > 0 ? ` | Diskon Poin: -Rp${pointDiscountVal} (${usedPointsCount} Poin)` : ''}${earnedCashbackPoints > 0 ? ` | Cashback Poin: +${earnedCashbackPoints}` : ''}`
    };

    const fullOrderData = {
        ...baseOrderData,
        point_used: usedPointsCount,
        point_discount: pointDiscountVal
    };

    // Simpan ke pendingOrderPayload agar dieksekusi saat tombol "Ya, Saya mengerti min & Kirim" diklik
    window.pendingOrderPayload = { baseOrderData, fullOrderData, sharePaketDiscountVal, earnedCashbackPoints, cashbackRate, usedPointsCount, customerPhone: phone };

    // =====================================================
    // BUKA MODAL KONFIRMASI WHATSAPP
    // =====================================================

    const waNumber = "62881036705137";

    pendingWAUrl =
        "https://wa.me/" +
        waNumber +
        "?text=" +
        text;

    openModal('finalWarningModal');
}

async function executeSendWA() {
    closeModal('finalWarningModal');

    // Buka tab WhatsApp secara sinkronus di awal agar tidak terkena popup-blocker browser
    if (pendingWAUrl) {
        window.open(pendingWAUrl, '_blank');
        pendingWAUrl = '';
    }

    const payloadSnapshot = window.pendingOrderPayload || null;

    // 🔥 SIMPAN DATA ORDER KE TABEL 'orders' SUPABASE
    if (window.pendingOrderPayload) {
        const { baseOrderData, fullOrderData } = window.pendingOrderPayload;
        window.pendingOrderPayload = null;

        try {
            let { error } = await supabaseClient.from('orders').insert([fullOrderData]);
            if (error) {
                console.warn("Insert dengan kolom poin gagal, menjalankan fallback insert standar:", error.message);
                const { error: fallbackError } = await supabaseClient.from('orders').insert([baseOrderData]);
                if (fallbackError) {
                    console.error("Gagal menyimpan pesanan ke Supabase:", fallbackError);
                    showValidationAlert("Pesanan terkirim ke WA, namun gagal tercatat di database: " + fallbackError.message);
                }
            }
        } catch (err) {
            console.error("Exception saat menyimpan pesanan ke Supabase:", err);
        }
    }

    // 🔥 TANDAI JATAH 1X SHARE PAKET HEMAT TELAH DIGUNAKAN
    if (payloadSnapshot && payloadSnapshot.sharePaketDiscountVal > 0) {
        const cleanPh = String(payloadSnapshot.customerPhone || loggedInCustomer?.phone || '').replace(/[^0-9]/g, '');
        if (cleanPh) {
            localStorage.removeItem(`ngopa_share_paket_used_${cleanPh}`);
            try {
                const variants = normalizePhoneVariants(cleanPh);
                await supabaseClient
                    .from('paket_hemat_shares')
                    .update({ claim_status: 'Sudah Dipakai Checkout', action_type: 'used_in_checkout' })
                    .in('customer_phone', variants)
                    .eq('action_type', 'verified_with_photo_proof');
            } catch (err) {
                console.warn('Gagal update status checkout di paket_hemat_shares:', err);
            }
        }
        hasAccountUsedSharePromo = true;
        isSharePaketHematDiscountActive = false;
        uploadedShareProofDataUrl = '';
    }

    // 🔥 POTONG POIN CUSTOMER SECARA FIFO (JIKA MENGGUNAKAN POIN)
    if (loggedInCustomer && isUsingPoints && payloadSnapshot && payloadSnapshot.usedPointsCount > 0) {
        const usedPts = payloadSnapshot.usedPointsCount;
        consumePointsFIFO(usedPts);

        try {
            const { error: ptErr } = await supabaseClient
                .from('customers')
                .update({ points: loggedInCustomer.points })
                .eq('id', loggedInCustomer.id);
            if (ptErr) console.error('Gagal update poin:', ptErr);
        } catch (e) {
            console.error('Exception update poin:', e);
        }
        isUsingPoints = false;
    }

    closeModal('cartModal');
    
    // 🔥 UBAH NOTIFIKASI
    if (payloadSnapshot && payloadSnapshot.earnedCashbackPoints > 0) {
        showToast(`Order terkirim! Cashback +${payloadSnapshot.earnedCashbackPoints} Poin akan masuk setelah pesanan selesai.`);
    } else {
        showToast("Orderan kamu sudah dikirim ke admin!");
    }
    
    setTimeout(async () => {
        cart = [];
        if (loggedInCustomer) {
            await syncCustomerPointsFromDB();
        }
        await syncCustomerLoyaltyDiscount();
        updateCartUI();
    }, 1000);
}

// ======================== LOYALTY & PROGRESS LEVEL AKUN (AUTO-SYNC DATABASE) ========================
let currentCustomerOrderCount = 0;
let currentLoyaltyLevelObj = LOYALTY_LEVELS[0];
let currentLoyaltyDiscount = 0;
let currentCustomerTotalSpend = 0;
let currentAccountSpendInfo = null;
let loyaltyPhoneTimeout = null;

function getLoyaltyLevel(totalOrders) {
    let result = LOYALTY_LEVELS[0];
    for (let lv of LOYALTY_LEVELS) {
        if (totalOrders >= lv.minOrders) result = lv;
    }
    return result;
}

function getAccountSpendLevelInfo(totalSpend) {
    const spend = Number(totalSpend) || 0;
    let currentTier = ACCOUNT_SPEND_LEVELS[0];
    let nextTier = ACCOUNT_SPEND_LEVELS[1];

    if (spend >= 500000) {
        currentTier = ACCOUNT_SPEND_LEVELS[3];
        nextTier = null;
    } else if (spend >= 300000) {
        currentTier = ACCOUNT_SPEND_LEVELS[2];
        nextTier = ACCOUNT_SPEND_LEVELS[3];
    } else if (spend >= 150000) {
        currentTier = ACCOUNT_SPEND_LEVELS[1];
        nextTier = ACCOUNT_SPEND_LEVELS[2];
    } else {
        currentTier = ACCOUNT_SPEND_LEVELS[0];
        nextTier = ACCOUNT_SPEND_LEVELS[1];
    }

    let progressPercent = 0;
    let remainingToNext = 0;
    let targetMax = currentTier.nextThreshold;

    if (nextTier) {
        const tierSpan = nextTier.minSpend - currentTier.minSpend;
        const progressInTier = Math.max(0, spend - currentTier.minSpend);
        progressPercent = Math.min(100, Math.round((progressInTier / tierSpan) * 100));
        remainingToNext = Math.max(0, nextTier.minSpend - spend);
        targetMax = nextTier.minSpend;
    } else {
        // Untuk Ngopers Holic (Rp 500.000 s/d Rp 1.000.000)
        progressPercent = Math.min(100, Math.round((spend / 1000000) * 100));
        remainingToNext = Math.max(0, 1000000 - spend);
        targetMax = 1000000;
    }

    return {
        currentTier,
        nextTier,
        totalSpend: spend,
        progressPercent,
        remainingToNext,
        targetMax
    };
}

function normalizePhoneVariants(phone) {
    const clean = String(phone || '').replace(/[^0-9]/g, '');
    if (!clean) return [];
    const variants = new Set([clean]);
    if (clean.startsWith('0')) {
        variants.add('62' + clean.slice(1));
        variants.add('+62' + clean.slice(1));
    } else if (clean.startsWith('62')) {
        variants.add('0' + clean.slice(2));
        variants.add('+' + clean);
    }
    return Array.from(variants);
}

async function getCustomerOrderCount(phone) {
    const variants = normalizePhoneVariants(phone);
    if (variants.length === 0) return 0;
    const { count, error } = await supabaseClient
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .in('customer_phone', variants)
        // 🔥 TAMBAHAN: Kecualikan status yang dibatalkan
        .not('status', 'ilike', '%batal%')
        .not('status', 'ilike', '%cancel%');
        
    if (error) {
        console.error('Gagal hitung order:', error);
        return 0;
    }
    return count || 0;
}

async function getCustomerOrderStats(phone) {
    const variants = normalizePhoneVariants(phone);
    if (variants.length === 0) return { totalOrders: 0, totalSpend: 0 };

    const { data, error } = await supabaseClient
        .from('orders')
        .select('total_price')
        .in('customer_phone', variants)
        // 🔥 TAMBAHAN: Kecualikan status yang dibatalkan
        .not('status', 'ilike', '%batal%')
        .not('status', 'ilike', '%cancel%');

    if (error || !data) {
        console.error('Gagal mengambil riwayat transaksi order:', error);
        return { totalOrders: 0, totalSpend: 0 };
    }

    const totalOrders = data.length;
    const totalSpend = data.reduce((sum, row) => sum + (Number(row.total_price) || 0), 0);
    return { totalOrders, totalSpend };
}

function updateAccountSpendProgressUI(spendInfo) {
    if (!spendInfo) return;
    const { currentTier, nextTier, totalSpend, progressPercent, remainingToNext, targetMax } = spendInfo;
    const formattedSpend = `Rp${totalSpend.toLocaleString('id-ID')}`;
    const formattedTarget = `Rp${targetMax.toLocaleString('id-ID')}`;
    const nextHintText = nextTier
        ? `Transaksi Rp${remainingToNext.toLocaleString('id-ID')} lagi untuk naik ke ${nextTier.icon} ${nextTier.level}!`
        : (totalSpend >= 1000000
            ? `👑 Level Maksimal Tercapai (Ngopers Holic)!`
            : `👑 Level Tertinggi (${currentTier.level}) • Menuju Rp1.000.000 (kurang Rp${remainingToNext.toLocaleString('id-ID')})`);

    // 1. Update di Modal Akun & Check-in (#userDashboardSection)
    const dashIcon = document.getElementById('dashSpendLevelIcon');
    const dashTitle = document.getElementById('dashSpendLevelTitle');
    const dashAmount = document.getElementById('dashSpendTotalAmount');
    const dashRange = document.getElementById('dashSpendRangeText');
    const dashPct = document.getElementById('dashSpendPercentText');
    const dashBar = document.getElementById('dashSpendProgressBar');
    const dashHint = document.getElementById('dashSpendNextHint');

    const cbPct = Math.round((currentTier.cashbackRate || 0) * 100);
    const dashCbBadge = document.getElementById('dashCashbackBenefitBadge');
    if (dashCbBadge) {
        dashCbBadge.innerText = cbPct > 0
            ? `🎁 Benefit Cashback Poin: ${cbPct}% / transaksi`
            : `Benefit Cashback Poin: 0% (Naik ke Ngopers Amatir untuk 3%)`;
    }
    if (dashIcon) dashIcon.innerText = currentTier.icon;
    if (dashTitle) dashTitle.innerText = currentTier.level;
    if (dashAmount) dashAmount.innerText = formattedSpend;
    if (dashRange) dashRange.innerText = `${formattedSpend} / ${formattedTarget}`;
    if (dashPct) dashPct.innerText = `${progressPercent}%`;
    if (dashBar) dashBar.style.width = `${progressPercent}%`;
    if (dashHint) dashHint.innerText = nextHintText;

    // 2. Update di Popup Pengumuman Harian (#announcementLoggedIn)
    const annBadge = document.getElementById('annSpendLevelBadge');
    const annTotal = document.getElementById('annSpendTotalText');
    const annBar = document.getElementById('annSpendProgressBar');
    const annInfo = document.getElementById('annSpendNextInfo');

    if (annBadge) annBadge.innerText = `${currentTier.icon} ${currentTier.level}`;
    // 🔥 PERBAIKAN: Ubah format agar tidak menyerupai persentase cashback
    if (annTotal) annTotal.innerText = `${formattedSpend} / ${formattedTarget}`;
    if (annBar) annBar.style.width = `${progressPercent}%`;
    if (annInfo) annInfo.innerText = nextHintText;

    // 3. Update di Form Order Keranjang (#cartSpendProgressBox)
    const cartBox = document.getElementById('cartSpendProgressBox');
    const cartLbl = document.getElementById('cartSpendLevelLabel');
    const cartTot = document.getElementById('cartSpendTotalLabel');
    const cartBar = document.getElementById('cartSpendProgressBar');
    const cartNxt = document.getElementById('cartSpendNextLabel');

    if (cartBox) {
        cartBox.classList.remove('hidden');
        if (cartLbl) cartLbl.innerText = `${currentTier.icon} ${currentTier.level}`;
        // 🔥 PERBAIKAN: Ubah format agar tidak menyerupai persentase cashback
        if (cartTot) cartTot.innerText = `${formattedSpend} / ${formattedTarget}`;
        if (cartBar) cartBar.style.width = `${progressPercent}%`;
        if (cartNxt) cartNxt.innerText = nextHintText;
    }
}

async function syncCustomerLoyaltyDiscount(phoneOverride) {
    const phoneInputEl = document.getElementById('custPhone');
    const targetPhone = (phoneOverride !== undefined ? phoneOverride : (phoneInputEl?.value?.trim() || loggedInCustomer?.phone || '')).trim();
    const statusInfoEl = document.getElementById('cartLoyaltyStatusInfo');
    const cartSpendBox = document.getElementById('cartSpendProgressBox');

    if (!targetPhone || targetPhone.replace(/[^0-9]/g, '').length < 9) {
        currentCustomerOrderCount = 0;
        currentLoyaltyLevelObj = LOYALTY_LEVELS[0];
        currentLoyaltyDiscount = 0;
        currentCustomerTotalSpend = 0;
        currentAccountSpendInfo = getAccountSpendLevelInfo(0);
        if (statusInfoEl) statusInfoEl.classList.add('hidden');
        if (cartSpendBox) cartSpendBox.classList.add('hidden');
        updateAccountSpendProgressUI(currentAccountSpendInfo);
        updateCartUI();
        return;
    }

    const { totalOrders, totalSpend } = await getCustomerOrderStats(targetPhone);
    const lvObj = getLoyaltyLevel(totalOrders);
    currentCustomerOrderCount = totalOrders;
    currentLoyaltyLevelObj = lvObj;
    currentLoyaltyDiscount = lvObj.discount || 0;

    currentCustomerTotalSpend = totalSpend;
    currentAccountSpendInfo = getAccountSpendLevelInfo(totalSpend);
    updateAccountSpendProgressUI(currentAccountSpendInfo);
    await checkHasCustomerUsedSharePromo(targetPhone);
    if (typeof renderPointExpiryUI === 'function') renderPointExpiryUI();

    if (statusInfoEl) {
        const isForeNow = (typeof isForeCoffeeSelected === 'function') ? isForeCoffeeSelected() : (selectedBrand === 'Fore Coffee');
        const dispLoyaltyDisc = isForeNow ? Math.floor(currentLoyaltyDiscount * 0.1) : currentLoyaltyDiscount;
        statusInfoEl.classList.remove('hidden');
        if (currentLoyaltyDiscount > 0) {
            statusInfoEl.className = "text-[10px] text-emerald-600 dark:text-emerald-400 font-extrabold mt-1 flex items-center gap-1";
            statusInfoEl.innerHTML = `<i class="fa-solid fa-crown text-amber-400"></i>${lvObj.icon} ${lvObj.level} (${totalOrders}x order) — Otomatis diskon Rp${dispLoyaltyDisc.toLocaleString('id-ID')}${isForeNow ? ` (Konversi Fore 10% dari Rp${currentLoyaltyDiscount.toLocaleString('id-ID')})` : ''} di order ke-${totalOrders + 1} ini!`;
        } else {
            const nextLv = LOYALTY_LEVELS.find(l => l.minOrders > totalOrders);
            const needed = nextLv ? (nextLv.minOrders - totalOrders) : 0;
            const nextDiscDisp = nextLv ? (isForeNow ? Math.floor(nextLv.discount * 0.1) : nextLv.discount) : 0;
            statusInfoEl.className = "text-[10px] text-gray-500 dark:text-gray-400 font-semibold mt-1";
            statusInfoEl.innerHTML = `🌱 Level ${lvObj.level} (${totalOrders}x order) — ${needed > 0 ? `Order ${needed}x lagi untuk naik ke ${nextLv.level} & dapat diskon Rp${nextDiscDisp.toLocaleString('id-ID')}/transaksi!` : ''}`;
        }
    }

    updateCartUI();
}

function onCustPhoneInput() {
    clearTimeout(loyaltyPhoneTimeout);
    loyaltyPhoneTimeout = setTimeout(() => {
        syncCustomerLoyaltyDiscount();
    }, 400);
}

async function checkLoyalty() {
    const phone = document.getElementById('loyaltyPhone').value.trim();
    if (!phone) { showValidationAlert("Masukkan nomor HP!"); return; }

    const totalOrders = await getCustomerOrderCount(phone);
    const level = getLoyaltyLevel(totalOrders);

    document.getElementById('loyaltyResult').innerHTML = `
        <div class="panel-card-item p-6 rounded-2xl text-center shadow-sm">
            <div class="text-5xl mb-2">${level.icon}</div>
            <div class="font-black text-brand-800 dark:text-amber-400 text-lg">${level.level}</div>
            <div class="text-xs text-gray-600 dark:text-gray-300 font-semibold">${level.desc}</div>
            <div class="mt-2 text-[11px] font-bold text-gray-500 dark:text-gray-400">Total Pesanan: ${totalOrders} transaksi</div>
            ${level.voucher ? `<div class="mt-3 text-[11px] bg-amber-400/20 border border-amber-400/50 rounded-xl p-2.5 text-brand-900 dark:text-amber-300 font-extrabold">🎁 Voucher: ${level.voucher}</div>` : ''}
        </div>
    `;
}

// ======================== BEST SELLER ========================

async function renderBestSellerFromOrders() {
    const container = document.getElementById('bestSellerList');
    if (!container) return;

    const { data: orders, error } = await supabaseClient
        .from('orders')
        .select('items')
        // 🔥 TAMBAHAN: Kecualikan orderan batal dari Best Seller
        .not('status', 'ilike', '%batal%')
        .not('status', 'ilike', '%cancel%');

    if (error || !orders) {
        container.innerHTML = `<p class="text-gray-400 text-center py-6">Belum ada data penjualan.</p>`;
        return;
    }

    const freq = {};
    orders.forEach(order => {
        if (order.items && Array.isArray(order.items)) {
            order.items.forEach(item => {
                const name = item.name || '';
                if (name) {
                    freq[name] = (freq[name] || 0) + 1;
                }
            });
        }
    });

    const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
    const top5 = sorted.slice(0, 5);

    if (top5.length === 0) {
        container.innerHTML = `<p class="text-gray-400 text-center py-6">Belum ada menu yang dipesan.</p>`;
        return;
    }

    container.innerHTML = top5.map(([name, count], idx) => `
        <div class="panel-card-item flex items-center justify-between p-3.5 rounded-2xl shadow-sm">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-brand-700 flex items-center justify-center text-amber-400 shadow-sm"><i class="fa-solid fa-mug-hot"></i></div>
                <div>
                    <div class="font-extrabold text-sm text-brand-900 dark:text-white">${name}</div>
                    <div class="text-[11px] font-semibold text-gray-600 dark:text-gray-300">${count} kali dipesan</div>
                </div>
            </div>
            <span class="text-[10px] font-black bg-amber-400 text-brand-900 px-2.5 py-1 rounded-full shadow-sm">Top ${idx + 1}</span>
        </div>
    `).join('');
}

async function openBestSellerModal() {
    await renderBestSellerFromOrders();
    openModal('bestSellerModal');
}

// ======================== ADMIN DASHBOARD (via URL) ========================

async function checkAdminAccess() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('admin') === '12345') {
        document.getElementById('mainBody').style.display = 'none';
        const container = document.getElementById('adminDashboardContainer');
        if (container) {
            container.style.display = 'block';
            container.style.position = 'relative';
            container.style.zIndex = '9999';
            await renderAdminDashboard();
            if (typeof loadAdminShareProofs === 'function') await loadAdminShareProofs();
        }
    }
}

async function renderAdminDashboard() {
    const tbody = document.getElementById('adminOrderTableBody');
    const emptyState = document.getElementById('adminEmptyState');

    const { data: orders, error } = await supabaseClient
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Gagal ambil pesanan:", error);
        return;
    }

    if (!orders || orders.length === 0) {
        tbody.innerHTML = '';
        if (emptyState) emptyState.style.display = 'block';
        return;
    }

    if (emptyState) emptyState.style.display = 'none';

    tbody.innerHTML = orders.map((order) => {
        const statusId = order.status.replace(/\s/g, '').toLowerCase();
        const orderDate = new Date(order.created_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' });

        return `
            <tr>
                <td style="color: #9ca3af; font-size: 11px;">${orderDate}</td>
                <td style="font-weight: bold; color: #ffffff;">
                    ${order.customer_name} <br>
                    <span style="color:#9ca3af; font-weight: normal;">${order.customer_phone}</span>
                </td>
                <td style="color: #FFC107; font-weight: bold;">Rp${Number(order.total_price).toLocaleString('id-ID')}</td>
                <td><span class="admin-badge ${statusId}">${order.status}</span></td>
                <td>
                    <select class="admin-status-select" onchange="updateOrderStatusViaUrl('${order.id}', this.value)">
                        <option value="Pesanan Diterima" ${order.status === 'Pesanan Diterima' ? 'selected' : ''}>Pesanan Diterima</option>
                        <option value="Sedang Diproses" ${order.status === 'Sedang Diproses' ? 'selected' : ''}>Sedang Diproses</option>
                        <option value="Siap Diambil/Diantar" ${order.status === 'Siap Diambil/Diantar' ? 'selected' : ''}>Siap Diambil/Diantar</option>
                        <option value="Selesai" ${order.status === 'Selesai' ? 'selected' : ''}>Selesai</option>
                        <option value="Dibatalkan" ${order.status === 'Dibatalkan' ? 'selected' : ''} style="color: #ef4444; font-weight: bold;">Dibatalkan (Cancel)</option>
                    </select>
                </td>
            </tr>
        `;
    }).join('');
}

async function updateOrderStatusViaUrl(orderId, newStatus) {
    try {
        const { data: currentOrder } = await supabaseClient
            .from('orders')
            .select('*')
            .eq('id', orderId)
            .single();

        const prevStatus = (currentOrder?.status || '').toLowerCase();
        const earnedPts = extractOrderEarnedPoints(currentOrder);

        const { error } = await supabaseClient
            .from('orders')
            .update({ status: newStatus })
            .eq('id', orderId);

        if (error) {
            showToast("Gagal mengubah status!");
        } else {
            if (newStatus.toLowerCase().includes('batal') || newStatus.toLowerCase().includes('cancel')) {
                if (currentOrder && currentOrder.customer_phone && prevStatus.includes('selesai')) {
                    await revokePointsOnCancellation(orderId, currentOrder.customer_phone, earnedPts);
                }
            }
            
            if (currentOrder && (newStatus === 'Selesai' || newStatus === 'Sudah selesai')) {
                if (!prevStatus.includes('selesai')) { 
                    await awardOrderPointsToCustomer(orderId, currentOrder.customer_phone, earnedPts);
                }
            }
            
            showToast("Status berhasil diperbarui!");
            await renderAdminDashboard();
        }
    } catch (err) {
        console.error(err);
        showToast("Terjadi kesalahan sistem.");
    }
}


// ======================== INIT CUSTOM SELECT ========================

function initCustomSelect() {
    const wrapper = document.querySelector('.custom-select');
    if (!wrapper) return;
    const trigger = wrapper.querySelector('.custom-select-trigger');
    const options = wrapper.querySelectorAll('.custom-option');
    const hiddenSelect = document.getElementById('orderMethod');
    const textSpan = document.getElementById('orderMethodText');

    trigger.addEventListener('click', function (e) {
        e.stopPropagation();
        wrapper.classList.toggle('open');
    });

    options.forEach(opt => {
        opt.addEventListener('click', function (e) {
            e.stopPropagation();
            const value = this.dataset.value;
            const label = this.textContent.trim();
            if (hiddenSelect) hiddenSelect.value = value;
            if (textSpan) textSpan.textContent = label;
            options.forEach(o => o.classList.remove('selected'));
            this.classList.add('selected');
            wrapper.classList.remove('open');
            toggleDeliveryFields();
        });
    });

    document.addEventListener('click', function (e) {
        if (!wrapper.contains(e.target)) wrapper.classList.remove('open');
    });
}
// ======================== SISTEM AKUN, CHECK-IN & POIN ========================
let loggedInCustomer = JSON.parse(localStorage.getItem('ngopa_customer')) || null;
let isUsingPoints = false;
let currentAuthMode = 'login'; // 'login' atau 'register'
let openedFromAnnouncement = false;

// ======================== LOG HISTORY POIN ========================
function logPointActivity(type, amount, description, balanceAfter, expiresAt = null, customId = null, customDate = null, statusTag = null) {
    if (!loggedInCustomer) return;
    const cleanPhone = String(loggedInCustomer.phone || '').replace(/[^0-9]/g, '');
    const key = `ngopa_point_history_${cleanPhone}`;
    
    let history = [];
    try {
        history = JSON.parse(localStorage.getItem(key) || '[]');
        if (!Array.isArray(history)) history = [];
    } catch(e) { history = []; }

    const entryId = customId || ('log-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7));
    const entryObj = {
        id: entryId,
        date: customDate ? new Date(customDate).toISOString() : new Date().toISOString(),
        type: type, // 'in' | 'out' | 'pending' | 'expired'
        amount: Math.abs(Number(amount) || 0),
        description: description,
        balance: balanceAfter,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
        status_tag: statusTag || null // 'active' | 'pending' | 'expired' | 'used'
    };

    // Jika customId sudah ada, perbarui datanya (misal dari Pending -> Selesai atau Aktif -> Hangus)
    const existingIdx = customId ? history.findIndex(h => h.id === customId) : -1;
    if (existingIdx > -1) {
        history[existingIdx] = { ...history[existingIdx], ...entryObj };
    } else {
        history.unshift(entryObj);
    }

    // Urutkan dari yang terbaru berdasarkan tanggal
    history.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Batasi maksimal 50 riwayat terakhir agar tidak membebani browser
    if (history.length > 50) history = history.slice(0, 50);
    
    localStorage.setItem(key, JSON.stringify(history));
    renderPointHistoryUI();
}

function renderPointHistoryUI() {
    const container = document.getElementById('dashPointHistoryList');
    if (!container || !loggedInCustomer) return;
    
    const cleanPhone = String(loggedInCustomer.phone || '').replace(/[^0-9]/g, '');
    const key = `ngopa_point_history_${cleanPhone}`;
    
    let history = [];
    try {
        history = JSON.parse(localStorage.getItem(key) || '[]');
        if (!Array.isArray(history)) history = [];
    } catch(e) { history = []; }

    // Bersihkan log sinkronisasi generik palsu jika sudah ada log spesifik order
    const hasSpecificOrderLogs = history.some(h => String(h.id || '').startsWith('order-'));
    if (hasSpecificOrderLogs) {
        history = history.filter(h => !String(h.id || '').startsWith('sync-in-') && !String(h.description || '').includes('Sinkronisasi DB'));
    }

    if (history.length === 0) {
        container.innerHTML = '<p class="text-[10px] text-gray-500 dark:text-gray-400 text-center py-4 italic">Belum ada riwayat aktivitas poin.</p>';
        return;
    }

    const now = new Date();

    container.innerHTML = history.map(log => {
        const isPending = log.type === 'pending' || log.status_tag === 'pending';
        const isIn = log.type === 'in' || isPending;
        const expDateObj = log.expires_at ? new Date(log.expires_at) : null;
        const isExpiredNow = Boolean(isIn && !isPending && expDateObj && !isNaN(expDateObj.getTime()) && now > expDateObj) || log.status_tag === 'expired';

        let colorClass = isIn ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';
        let icon = isIn ? 'fa-circle-plus' : 'fa-circle-minus';
        let sign = isIn ? '+' : '-';

        if (isPending) {
            colorClass = 'text-gray-500 dark:text-gray-400';
            icon = 'fa-clock';
            sign = '+';
        } else if (isExpiredNow) {
            colorClass = 'text-rose-500 dark:text-rose-400';
            icon = 'fa-calendar-xmark';
        }

        const dateStr = new Date(log.date).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' });
        
        // Tampilkan badge status (Aktif & Exp 2 Bulan / Pending / Hangus) seperti tampilan di Riwayat Pesanan
        let statusAndExpiryHtml = '';
        if (isPending) {
            const estExpStr = expDateObj ? formatDateDDMMYYYY(expDateObj) : '-';
            statusAndExpiryHtml = `
                <div class="mt-1 flex flex-wrap items-center gap-1">
                    <span class="text-[9px] font-extrabold text-gray-500 bg-gray-100 dark:bg-brand-800 px-2 py-0.5 rounded-md border border-gray-300 dark:border-brand-600 inline-flex items-center gap-1">
                        <i class="fa-solid fa-clock"></i> +${log.amount} Poin Cashback (Pending)
                    </span>
                    <span class="text-[8px] text-gray-400 font-semibold">• Berlaku 2 bln s/d ${estExpStr} setelah Selesai</span>
                </div>
            `;
        } else if (isExpiredNow) {
            const expDateStr = expDateObj ? formatDateDDMMYYYY(expDateObj) : '-';
            statusAndExpiryHtml = `
                <div class="mt-1 flex flex-wrap items-center gap-1">
                    <span class="text-[9px] font-extrabold text-rose-600 dark:text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-md border border-rose-400/30 inline-flex items-center gap-1">
                        <i class="fa-solid fa-ban"></i> Poin Cashback (Hangus)
                    </span>
                    <span class="text-[9px] text-rose-500 dark:text-rose-400 font-bold">• Exp: ${expDateStr}</span>
                </div>
            `;
        } else if (isIn && expDateObj) {
            const expDateStr = formatDateDDMMYYYY(expDateObj);
            const isCashbackOrder = String(log.id || '').startsWith('order-in-') || String(log.description || '').toLowerCase().includes('cashback');
            statusAndExpiryHtml = `
                <div class="mt-1 flex flex-wrap items-center gap-1">
                    ${isCashbackOrder ? `<span class="text-[9px] font-extrabold text-amber-600 dark:text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-md border border-amber-400/30 inline-flex items-center gap-1"><i class="fa-solid fa-coins"></i> +${log.amount} Poin Cashback</span>` : ''}
                    <span class="text-[9px] text-amber-600 dark:text-amber-400 font-bold inline-flex items-center gap-1">
                        <i class="fa-regular fa-clock"></i> Exp: ${expDateStr} (2 Bulan)
                    </span>
                </div>
            `;
        }
        
        const rightBalanceText = isPending
            ? `<p class="text-[9px] text-amber-600 dark:text-amber-400 font-bold mt-0.5">Menunggu Selesai</p>`
            : (isExpiredNow
                ? `<p class="text-[9px] text-rose-500 font-bold mt-0.5">Hangus (Lewat 2 Bln)</p>`
                : `<p class="text-[9px] text-gray-400 font-bold mt-0.5">Sisa: ${log.balance ?? (loggedInCustomer.points || 0)}</p>`);

        return `
            <div class="flex items-center justify-between bg-white dark:bg-brand-900/50 p-2.5 rounded-xl border ${isPending ? 'border-dashed border-gray-300 dark:border-brand-600 opacity-85' : (isExpiredNow ? 'border-rose-200 dark:border-rose-900/50 opacity-75' : 'border-brand-100 dark:border-brand-700/60')} shadow-sm">
                <div class="flex items-start gap-2.5 pr-2">
                    <i class="fa-solid ${icon} ${colorClass} mt-0.5 text-sm"></i>
                    <div>
                        <p class="font-extrabold text-brand-900 dark:text-gray-200 leading-tight">${log.description}</p>
                        <p class="text-[9px] text-gray-500 dark:text-gray-400 mt-0.5 font-medium">${dateStr}</p>
                        ${statusAndExpiryHtml}
                    </div>
                </div>
                <div class="text-right shrink-0">
                    <span class="font-black text-xs ${colorClass} ${isExpiredNow ? 'line-through' : ''}">${sign}${log.amount} Poin</span>
                    ${rightBalanceText}
                </div>
            </div>
        `;
    }).join('');
}
// ======================== FITUR UPLOAD FOTO PROFIL ========================
function handleAvatarUpload(event) {
    const file = event.target.files[0];
    if (!file || !loggedInCustomer) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const maxDim = 200; // Kompresi ukuran agar ringan
            let w = img.width;
            let h = img.height;
            
            if (w > maxDim || h > maxDim) {
                if (w > h) { h = Math.round((h * maxDim) / w); w = maxDim; }
                else { w = Math.round((w * maxDim) / h); h = maxDim; }
            }
            
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            
            const base64 = canvas.toDataURL('image/jpeg', 0.8);
            
            // Simpan ke localStorage berdasarkan Nomor HP
            localStorage.setItem(`ngopa_avatar_${loggedInCustomer.phone}`, base64);
            updateAvatarUI(base64);
            showToast("Foto profil berhasil diperbarui!");
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function updateAvatarUI(base64) {
    const imgEl = document.getElementById('dashAvatarImg');
    const initialEl = document.getElementById('dashAvatarInitial');
    if (!imgEl || !initialEl) return;
    
    if (base64) {
        imgEl.src = base64;
        imgEl.classList.remove('hidden');
        initialEl.classList.add('hidden');
    } else {
        imgEl.src = '';
        imgEl.classList.add('hidden');
        initialEl.classList.remove('hidden');
    }
}

// 🔥 REKONSILIASI & SINKRONISASI PENUH (ORDER SUPABASE + CHECK-IN HARIAN DARI CUSTOMERS SUPABASE)
async function reconcileCompletedOrdersPoints(customerObj) {
    if (!customerObj || !customerObj.phone) return customerObj;
    try {
        const variants = normalizePhoneVariants(customerObj.phone);
        if (variants.length === 0) return customerObj;

        const { data: dbOrders, error } = await supabaseClient
            .from('orders')
            .select('*')
            .in('customer_phone', variants)
            .order('created_at', { ascending: true });

        if (error) return customerObj;
        const orders = Array.isArray(dbOrders) ? dbOrders : [];

        const cleanPhone = String(customerObj.phone).replace(/[^0-9]/g, '');
        const awardedKey = `ngopa_awarded_order_ids_${cleanPhone}`;
        const historyKey = `ngopa_point_history_${cleanPhone}`;
        const batchKey = getCustomerPointBatchesKey(customerObj.phone);

        let history = [];
        try {
            history = JSON.parse(localStorage.getItem(historyKey) || '[]');
            if (!Array.isArray(history)) history = [];
        } catch (e) { history = []; }

        let batches = [];
        try {
            batches = JSON.parse(localStorage.getItem(batchKey) || '[]');
            if (!Array.isArray(batches)) batches = [];
        } catch (e) { batches = []; }

        // 🔥 1. SAPU BERSIH SELURUH RIWAYAT & BATCH LAMA YANG BERKAITAN DENGAN ORDER
        // Hanya pertahankan log murni non-order (seperti Check-in Harian)
        const nonOrderHistory = history.filter(h => {
            const hId = String(h.id || '');
            const desc = String(h.description || '').toLowerCase();
            if (hId.startsWith('order-') || hId.startsWith('revoke-order-') || hId.startsWith('sync-in-')) return false;
            if (desc.includes('ngop-') || desc.includes('order') || desc.includes('checkout') || desc.includes('sinkronisasi')) return false;
            return true;
        });

        // Hanya pertahankan batch poin non-order (misal dari Check-in Harian)
        const nonOrderBatches = batches.filter(b => {
            const bId = String(b.id || '');
            const src = String(b.source || '').toLowerCase();
            if (bId.startsWith('batch-order-') || bId.startsWith('init-') || bId.startsWith('sync-')) return false;
            if (src.includes('ngop-') || src.includes('order') || src.includes('sinkronisasi') || src.includes('awal aktif')) return false;
            return true;
        });

        const now = new Date();
        const validNonOrderBatches = nonOrderBatches.filter(b => {
            const expDate = new Date(b.expires_at);
            return !isNaN(expDate.getTime()) && now <= expDate && Number(b.remaining) > 0;
        });

        // 🔥 1B. SINKRONISASI RIWAYAT CHECK-IN DARI TABEL 'customers' SUPABASE (`last_checkin` & `checkin_streak`)
        // Jika di Supabase tercatat sudah check-in pada tanggal `last_checkin` (misal hari ini 2026-11-13),
        // tetapi di Riwayat Aktivitas Poin belum ada log Check-in Harian pada tanggal tersebut, otomatis tambahkan!
        if (customerObj.last_checkin) {
            const lastCheckinDateStr = String(customerObj.last_checkin).split('T')[0]; // Format: YYYY-MM-DD
            const hasCheckinLogOnDate = nonOrderHistory.some(h => {
                const desc = String(h.description || '').toLowerCase();
                if (!desc.includes('check-in') && !desc.includes('checkin')) return false;
                if (!h.date) return false;
                const hDate = new Date(h.date);
                if (isNaN(hDate.getTime())) return false;
                // Bandingkan baik format YYYY-MM-DD UTC maupun tanggal lokal
                const isoDay = hDate.toISOString().split('T')[0];
                const localDay = `${hDate.getFullYear()}-${String(hDate.getMonth() + 1).padStart(2, '0')}-${String(hDate.getDate()).padStart(2, '0')}`;
                return isoDay === lastCheckinDateStr || localDay === lastCheckinDateStr || h.id === `checkin-${lastCheckinDateStr}`;
            });

            if (!hasCheckinLogOnDate) {
                // Buat timestamp check-in yang sinkron dengan tanggal last_checkin
                const todayIsoStr = now.toISOString().split('T')[0];
                const todayLocalStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                const checkinTimestamp = (lastCheckinDateStr === todayIsoStr || lastCheckinDateStr === todayLocalStr)
                    ? now
                    : new Date(`${lastCheckinDateStr}T08:00:00`);
                const checkinExpDate = addTwoMonthsDate(checkinTimestamp);
                const checkinBatchId = `batch-checkin-${lastCheckinDateStr}`;

                // Pastikan batch kadaluarsa 2 bulan untuk check-in tanggal tersebut juga ada
                if (!validNonOrderBatches.some(b => b.id === checkinBatchId)) {
                    // Cek apakah order setelah tanggal check-in sudah menghabiskan poin check-in ini
                    const ordersOnOrAfterCheckin = orders.filter(o => {
                        const st = String(o.status || '').toLowerCase();
                        if (st.includes('batal') || st.includes('cancel')) return false;
                        const oDay = String(o.created_at || '').split('T')[0];
                        return oDay >= lastCheckinDateStr && extractOrderUsedPoints(o) > 0;
                    });
                    const wasConsumedInOrder = ordersOnOrAfterCheckin.length > 0;

                    validNonOrderBatches.push({
                        id: checkinBatchId,
                        source: 'Check-in Harian',
                        amount: 15,
                        remaining: wasConsumedInOrder ? 0 : 15,
                        earned_at: checkinTimestamp.toISOString(),
                        expires_at: checkinExpDate.toISOString()
                    });
                }

                // Hitung estimasi saldo saat check-in tersebut dilakukan
                const prevCheckinLogs = nonOrderHistory.filter(h => new Date(h.date) < checkinTimestamp);
                const prevBalance = prevCheckinLogs.length > 0 ? (Number(prevCheckinLogs[0].balance) || 1455) : 0;

                nonOrderHistory.push({
                    id: `checkin-${lastCheckinDateStr}`,
                    date: checkinTimestamp.toISOString(),
                    type: 'in',
                    amount: 15,
                    description: 'Check-in Harian',
                    balance: prevBalance + 15,
                    expires_at: checkinExpDate.toISOString(),
                    status_tag: 'active'
                });
            }
        }

        // Hitung poin check-in yang masih aktif dan belum terpakai
        const activeCheckinPts = validNonOrderBatches.reduce((sum, b) => sum + (Number(b.remaining) || 0), 0);

        // 🔥 2. BANGUN ULANG RIWAYAT & BATCH ORDER MURNI DARI BARIS TABEL 'orders' SUPABASE SAAT INI
        const rebuiltOrderHistory = [];
        const rebuiltOrderBatches = [];
        const validAwardedIds = [];
        let activeOrderCashbackTotal = 0;

        // Hitung akumulasi poin secara kronologis dari order yang benar-benar ada di Supabase
        let runningOrderPts = activeCheckinPts;

        for (const ord of orders) {
            const st = String(ord.status || '').toLowerCase().trim();
            const isCompleted = (st === 'selesai' || st === 'sudah selesai');
            const isCancelled = (st.includes('batal') || st.includes('cancel'));
            const earnedPts = extractOrderEarnedPoints(ord);
            const usedPts = extractOrderUsedPoints(ord);
            const orderCode = ord.order_code || `NGOP-${ord.id}`;
            const orderDate = ord.created_at ? new Date(ord.created_at) : now;
            const expDate = addTwoMonthsDate(orderDate);
            const isExpired = now > expDate;

            if (isCancelled) continue;

            // Catat pemakaian poin jika order ini memakai potongan poin saat checkout
            if (usedPts > 0) {
                rebuiltOrderHistory.push({
                    id: `order-out-${ord.id}`,
                    date: orderDate.toISOString(),
                    type: 'out',
                    amount: usedPts,
                    description: `Potongan Poin Checkout (${orderCode})`,
                    balance: Math.max(0, runningOrderPts),
                    expires_at: null,
                    status_tag: 'used'
                });
            }

            if (earnedPts > 0) {
                if (isCompleted) {
                    if (!isExpired) {
                        activeOrderCashbackTotal += earnedPts;
                        runningOrderPts += earnedPts;
                    }

                    rebuiltOrderHistory.push({
                        id: `order-in-${ord.id}`,
                        date: orderDate.toISOString(),
                        type: 'in',
                        amount: earnedPts,
                        description: `Cashback Order Selesai (${orderCode})`,
                        balance: runningOrderPts,
                        expires_at: expDate.toISOString(),
                        status_tag: isExpired ? 'expired' : 'active'
                    });

                    rebuiltOrderBatches.push({
                        id: `batch-order-${ord.id}`,
                        source: `Cashback Order (${orderCode})`,
                        amount: earnedPts,
                        remaining: isExpired ? 0 : earnedPts,
                        earned_at: orderDate.toISOString(),
                        expires_at: expDate.toISOString()
                    });

                    validAwardedIds.push(String(ord.id));

                    // Pastikan di Supabase ditandai points_awarded = true
                    if (ord.points_awarded !== true) {
                        supabaseClient.from('orders').update({ points_awarded: true }).eq('id', ord.id).then(() => {});
                    }
                } else {
                    // Order masih Pending (Pesanan Diterima / Diproses / Siap)
                    rebuiltOrderHistory.push({
                        id: `order-pending-${ord.id}`,
                        date: orderDate.toISOString(),
                        type: 'pending',
                        amount: earnedPts,
                        description: `Cashback Order (${orderCode})`,
                        balance: runningOrderPts,
                        expires_at: expDate.toISOString(),
                        status_tag: 'pending'
                    });
                }
            }
        }

        // 🔥 3. SINKRONKAN SALDO POIN CUSTOMER DI DATABASE SUPABASE JIKA TIDAK SESUAI DENGAN TOTAL ORDER AKTIF
        const expectedValidPoints = activeCheckinPts + activeOrderCashbackTotal;
        const currentDbPoints = Number(customerObj.points) || 0;

        if (currentDbPoints !== expectedValidPoints) {
            const { error: syncPtsErr } = await supabaseClient
                .from('customers')
                .update({ points: expectedValidPoints })
                .eq('id', customerObj.id);

            if (!syncPtsErr) {
                customerObj.points = expectedValidPoints;
            }
        }

        // Gabungkan riwayat non-order (check-in) dan riwayat order dari Supabase, lalu urutkan dari yang terbaru
        const finalHistory = [...nonOrderHistory, ...rebuiltOrderHistory].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 50);
        const finalBatches = [...validNonOrderBatches.filter(b => Number(b.remaining) > 0), ...rebuiltOrderBatches.filter(b => Number(b.remaining) > 0)];

        localStorage.setItem(historyKey, JSON.stringify(finalHistory));
        localStorage.setItem(batchKey, JSON.stringify(finalBatches));
        localStorage.setItem(awardedKey, JSON.stringify(validAwardedIds));

    } catch (e) {
        console.warn("Gagal rekonsiliasi poin order selesai:", e);
    }
    return customerObj;
}

async function syncCustomerPointsFromDB() {
    if (!loggedInCustomer) return;
    try {
        let { data: latestCust, error } = await supabaseClient
            .from('customers')
            .select('*')
            .eq('id', loggedInCustomer.id)
            .maybeSingle();

        if (!latestCust && loggedInCustomer.phone) {
            const variants = normalizePhoneVariants(loggedInCustomer.phone);
            const { data: custByPhone } = await supabaseClient
                .from('customers')
                .select('*')
                .in('phone', variants)
                .limit(1);
            if (custByPhone && custByPhone.length > 0) latestCust = custByPhone[0];
        }
        
        if (latestCust && !error) {
            // Rekonsiliasi penuh dengan tabel orders & customers Supabase
            latestCust = await reconcileCompletedOrdersPoints(latestCust);
            loggedInCustomer = latestCust; 
            localStorage.setItem('ngopa_customer', JSON.stringify(loggedInCustomer)); 
            
            loadAndCleanExpiredPointBatches(loggedInCustomer.phone);
            renderPointExpiryUI();
            if (typeof renderPointHistoryUI === 'function') renderPointHistoryUI();
        }
    } catch (e) {
        console.error("Gagal sinkronisasi poin dari DB:", e);
    }
}

async function openAccountModal(mode = 'login') {
    openedFromAnnouncement = false;
    currentAuthMode = mode;
    const custPhoneVal = document.getElementById('custPhone')?.value?.trim();
    const authPhoneEl = document.getElementById('authPhone');
    if (custPhoneVal && authPhoneEl && !authPhoneEl.value.trim()) authPhoneEl.value = custPhoneVal;
    
    openModal('accountModal');
    if (loggedInCustomer) {
        await syncCustomerPointsFromDB();
    }
    renderAccountModalUI();
}

async function openAccountModalFromAnnouncement(mode = 'login') {
    closeModal('dailyAnnouncementModal');
    openedFromAnnouncement = true;
    currentAuthMode = mode;
    const custPhoneVal = document.getElementById('custPhone')?.value?.trim();
    const authPhoneEl = document.getElementById('authPhone');
    if (custPhoneVal && authPhoneEl && !authPhoneEl.value.trim()) authPhoneEl.value = custPhoneVal;
    openModal('accountModal');
    if (loggedInCustomer) {
        await syncCustomerPointsFromDB();
    }
    renderAccountModalUI();
}

function toggleAuthMode(mode) {
    currentAuthMode = mode;
    updateAuthFormModeUI();
}

function updateAuthFormModeUI() {
    const nameContainer = document.getElementById('authNameContainer');
    const subtitleEl = document.getElementById('authSubtitleText');
    const submitBtn = document.getElementById('authSubmitBtn');
    const toggleTextEl = document.getElementById('authToggleModeText');

    if (!nameContainer || !submitBtn || !toggleTextEl) return;

    if (currentAuthMode === 'register') {
        nameContainer.classList.remove('hidden');
        if (subtitleEl) subtitleEl.innerText = "Lengkapi data di bawah ini untuk mendaftarkan akun baru dan mulai kumpulkan poin harian!";
        submitBtn.innerText = "Daftar Akun Sekarang";
        toggleTextEl.innerHTML = `Sudah punya akun? <span onclick="toggleAuthMode('login')" class="text-amber-400 font-extrabold underline cursor-pointer hover:text-amber-300">login sekarang</span>`;
    } else {
        nameContainer.classList.add('hidden');
        if (subtitleEl) subtitleEl.innerText = "Masuk dengan Nomor WhatsApp / HP dan PIN akunmu untuk mulai check-in harian & gunakan diskon poin!";
        submitBtn.innerText = "Login Akun";
        toggleTextEl.innerHTML = `Tidak punya akun? <span onclick="toggleAuthMode('register')" class="text-amber-400 font-extrabold underline cursor-pointer hover:text-amber-300">daftarkan sekarang</span>`;
    }
}

function renderAccountModalUI() {
    const authSec = document.getElementById('authFormSection');
    const dashSec = document.getElementById('userDashboardSection');
    
    if (loggedInCustomer) {
        authSec.classList.add('hidden');
        dashSec.classList.remove('hidden');
        
        const customerDisplayName = loggedInCustomer.name || loggedInCustomer.phone || 'Customer';
        
          // 🔥 UPDATE DATA KE DESAIN BARU
        const avatarEl = document.getElementById('dashAvatarInitial');
        if (avatarEl) avatarEl.innerText = customerDisplayName.charAt(0).toUpperCase();
        
        // 🔥 TAMBAHKAN INI: Load foto profil dari localStorage
        const savedAvatar = localStorage.getItem(`ngopa_avatar_${loggedInCustomer.phone}`);
        updateAvatarUI(savedAvatar);
        
        document.getElementById('dashCustomerName').innerText = customerDisplayName;
        document.getElementById('dashCustomerPhone').innerText = loggedInCustomer.phone;
        document.getElementById('dashCustomerPoints').innerHTML = `${loggedInCustomer.points || 0} <span class="text-[10px]">pts</span>`;
        document.getElementById('dashStreakCount').innerText = loggedInCustomer.checkin_streak || 0;
        
        checkTodayCheckinStatus();
        
        if (typeof renderPointHistoryUI === 'function') renderPointHistoryUI();
        
        if (typeof syncCustomerLoyaltyDiscount === 'function') {
            syncCustomerLoyaltyDiscount(loggedInCustomer.phone);
        }
    } else {
        authSec.classList.remove('hidden');
        dashSec.classList.add('hidden');
        updateAuthFormModeUI();
    }
}

async function handleCustomerLoginRegister() {
    const name = document.getElementById('authName').value.trim();
    const phone = document.getElementById('authPhone').value.trim();
    const pin = document.getElementById('authPin').value.trim();

    if (!phone || !pin) {
        showValidationAlert("Nomor WhatsApp/HP dan PIN/Password wajib diisi!");
        return;
    }

    try {
        let { data: existingUser, error } = await supabaseClient
            .from('customers')
            .select('*')
            .eq('phone', phone)
            .maybeSingle();

        if (currentAuthMode === 'login') {
            if (!existingUser) {
                showValidationAlert("Akun dengan Nomor HP tersebut belum terdaftar! Silakan klik 'daftarkan sekarang' di bawah.");
                toggleAuthMode('register');
                return;
            }
            if (existingUser.pin !== pin) {
                showValidationAlert("PIN / Password salah! Silakan coba lagi.");
                return;
            }
            loggedInCustomer = existingUser;
        } else {
            if (existingUser) {
                if (existingUser.pin === pin) {
                    loggedInCustomer = existingUser;
                    showToast("Nomor HP sudah terdaftar, otomatis masuk ke akunmu!");
                } else {
                    showValidationAlert("Nomor HP sudah terdaftar! Silakan masuk di menu Login.");
                    toggleAuthMode('login');
                    return;
                }
            } else {
                if (!name) {
                    showValidationAlert("Nama lengkap wajib diisi untuk pendaftaran akun baru!");
                    document.getElementById('authName').focus();
                    return;
                }
                const newUser = { name, phone, pin, points: 0, checkin_streak: 0, last_checkin: null };
                const { data: inserted, error: insertErr } = await supabaseClient
                    .from('customers')
                    .insert([newUser])
                    .select()
                    .single();

                if (insertErr) throw insertErr;
                loggedInCustomer = inserted;
                if (typeof recordNewAccountReferralRegistration === 'function') {
                    recordNewAccountReferralRegistration(inserted);
                }
                showToast("Akun berhasil didaftarkan & otomatis masuk!");
            }
        }

        localStorage.setItem('ngopa_customer', JSON.stringify(loggedInCustomer));
        // 🔥 Rekonsiliasi & sinkronisasi otomatis poin cashback dari order yang sudah 'Selesai' saat login
        await syncCustomerPointsFromDB();

        const nameInput = document.getElementById('custName');
        const phoneInput = document.getElementById('custPhone');
        if (nameInput && loggedInCustomer.name) nameInput.value = loggedInCustomer.name;
        if (phoneInput && loggedInCustomer.phone) phoneInput.value = loggedInCustomer.phone;
        
        await syncCustomerLoyaltyDiscount(loggedInCustomer.phone);
        renderAccountModalUI();
        renderAnnouncementCheckinUI();
        updateCartUI();
        showToast(`Selamat datang, ${loggedInCustomer.name}!`);

        if (openedFromAnnouncement) {
            openedFromAnnouncement = false;
            closeModal('accountModal');
            openModal('dailyAnnouncementModal');
        }
    } catch (err) {
        console.error(err);
        showValidationAlert("Gagal memproses akun. Periksa koneksi database.");
    }
}

function customerLogout() {
    loggedInCustomer = null;
    isUsingPoints = false;
    localStorage.removeItem('ngopa_customer');
    const phoneInput = document.getElementById('custPhone');
    if (phoneInput) phoneInput.value = '';
    syncCustomerLoyaltyDiscount('');
    renderAccountModalUI();
    renderAnnouncementCheckinUI();
    updateCartUI();
    showToast("Berhasil keluar akun.");
}

// ======================== RIWAYAT PESANAN CUSTOMER ========================
async function openOrderHistoryModal() {
    if (!loggedInCustomer) {
        showValidationAlert("Silakan login terlebih dahulu untuk melihat riwayat pesanan.");
        return;
    }
    renderOrderHistory();
    openModal('orderHistoryModal');
    await syncCustomerPointsFromDB();
    renderAccountModalUI();
}

async function renderOrderHistory() {
    const container = document.getElementById('orderHistoryList');
    container.innerHTML = '<p class="text-center text-xs text-gray-500 dark:text-gray-400 py-6">Memuat riwayat pesanan...</p>';
    
    const variants = normalizePhoneVariants(loggedInCustomer.phone);
    if (variants.length === 0) {
        container.innerHTML = '<p class="text-center text-xs text-gray-500 dark:text-gray-400 py-6">Nomor HP tidak valid.</p>';
        return;
    }

    try {
        // Ambil data dari tabel orders berdasarkan variasi nomor HP
        const { data: orders, error } = await supabaseClient
            .from('orders')
            .select('*')
            .in('customer_phone', variants)
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Sinkronkan juga poin & riwayat aktivitas poin setiap kali daftar order ditarik dari Supabase
        await syncCustomerPointsFromDB();
        if (typeof renderAccountModalUI === 'function') renderAccountModalUI();

        if (!orders || orders.length === 0) {
            container.innerHTML = `
                <div class="text-center py-8">
                    <i class="fa-solid fa-receipt text-4xl text-gray-300 dark:text-gray-600 mb-3"></i>
                    <p class="text-sm font-bold text-gray-500 dark:text-gray-400">Belum ada riwayat pesanan.</p>
                    <p class="text-xs text-gray-400 mt-1">Yuk pesan menu favoritmu sekarang!</p>
                </div>
            `;
            return;
        }

        container.innerHTML = orders.map(order => {
            // Format tanggal
            const date = new Date(order.created_at).toLocaleString('id-ID', { 
                weekday: 'long', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
            });
            
            // Warna Badge Status
            let statusClass = "bg-gray-500 text-white";
            const s = (order.status || 'Pesanan Diterima').toLowerCase();
            if (s.includes('diterima')) statusClass = "bg-blue-500 text-white";
            else if (s.includes('proses')) statusClass = "bg-amber-500 text-white";
            else if (s.includes('siap')) statusClass = "bg-emerald-500 text-white";
            else if (s.includes('selesai')) statusClass = "bg-gray-600 text-white";
            else if (s.includes('batal')) statusClass = "bg-red-500 text-white";

            // 🔥 PERBAIKAN: Tampilkan status poin (Selesai + Exp 2 Bulan / Hangus / Pending / Batal)
            const isCancelled = (order.status || '').toLowerCase().includes('batal') || (order.status || '').toLowerCase().includes('cancel');
            const isCompleted = (order.status || '').toLowerCase().includes('selesai');
            const earnedPts = extractOrderEarnedPoints(order);
            const orderDateObj = order.created_at ? new Date(order.created_at) : new Date();
            const expDateObj = addTwoMonthsDate(orderDateObj);
            const expDateStr = formatDateDDMMYYYY(expDateObj);
            const isPointExpired = new Date() > expDateObj;
            
            let pointsHtml = '';
            if (earnedPts > 0) {
                if (isCancelled) {
                    pointsHtml = ''; // Sembunyikan jika batal
                } else if (isCompleted) {
                    if (isPointExpired) {
                        // Tampil jika sudah lewat 2 bulan (Hangus)
                        pointsHtml = `<div class="mt-2 text-[10px] font-extrabold text-rose-600 dark:text-rose-400 bg-rose-500/10 inline-block px-2 py-1 rounded-md border border-rose-400/30"><i class="fa-solid fa-ban"></i> +${earnedPts} Poin Cashback (Hangus • Exp: ${expDateStr})</div>`;
                    } else {
                        // Tampil jika sudah selesai dan masih aktif (beserta masa berlaku 2 bulan)
                        pointsHtml = `<div class="mt-2 text-[10px] font-extrabold text-amber-600 dark:text-amber-400 bg-amber-400/10 inline-block px-2 py-1 rounded-md border border-amber-400/30"><i class="fa-solid fa-coins"></i> +${earnedPts} Poin Cashback <span class="text-[9px] font-bold opacity-85">• Exp: ${expDateStr}</span></div>`;
                    }
                } else {
                    // Tampil "Pending" jika order belum selesai
                    pointsHtml = `<div class="mt-2 text-[10px] font-extrabold text-gray-500 bg-gray-100 dark:bg-brand-800 inline-block px-2 py-1 rounded-md border border-gray-300 dark:border-brand-600"><i class="fa-solid fa-clock"></i> +${earnedPts} Poin Cashback (Pending)</div>`;
                }
            }
            // Render item
            const itemsHtml = (order.items || []).map(item => `
                <div class="flex justify-between items-start text-[11px] mb-1.5">
                    <div class="flex items-start gap-1.5 pr-2">
                        <span class="font-black text-brand-700 dark:text-amber-400 mt-0.5">${item.quantity || 1}x</span>
                        <div>
                            <span class="font-semibold text-gray-700 dark:text-gray-200">${item.name} ${item.size ? `(${item.size})` : ''}</span>
                            ${item.note ? `<p class="text-[9px] text-gray-400 italic">"${item.note}"</p>` : ''}
                        </div>
                    </div>
                    <span class="font-bold text-brand-900 dark:text-white whitespace-nowrap">Rp${(Number(item.price) * (item.quantity || 1)).toLocaleString('id-ID')}</span>
                </div>
            `).join('');

            return `
                <div class="bg-brand-50 dark:bg-brand-800 rounded-2xl p-4 border border-brand-200 dark:border-brand-700 shadow-sm mb-3">
                    <!-- Header Tanggal & Status -->
                    <div class="flex justify-between items-start mb-3 pb-3 border-b border-brand-200 dark:border-brand-700">
                        <div>
                            <p class="text-[10px] text-gray-500 dark:text-gray-400 font-bold uppercase tracking-wider">${date}</p>
                            <p class="text-xs font-black text-brand-900 dark:text-white mt-0.5">Kode: ${order.order_code || `NGOP-${order.id}`}</p>
                            <!-- 🔥 TAMBAHKAN INI: Tampilkan Poin -->
                            ${pointsHtml}
                        </div>
                        <span class="${statusClass} px-2.5 py-1 rounded-full text-[9px] font-black uppercase shadow-sm">${order.status || 'Pesanan Diterima'}</span>
                    </div>
                    
                    <!-- List Item -->
                    <div class="mb-3">
                        ${itemsHtml || '<p class="text-[10px] text-gray-500 italic">Tidak ada detail item.</p>'}
                    </div>
                    
                    <!-- Total -->
                    <div class="flex justify-between items-center pt-3 border-t border-brand-200 dark:border-brand-700">
                        <span class="text-[10px] text-gray-500 dark:text-gray-400 font-bold">Total Pembayaran</span>
                        <span class="text-sm font-black text-emerald-600 dark:text-emerald-400">Rp${Number(order.total_price).toLocaleString('id-ID')}</span>
                    </div>
                </div>
            `;
        }).join('');

    } catch (err) {
        console.error("Gagal load riwayat:", err);
        container.innerHTML = '<p class="text-center text-xs text-red-500 py-6">Gagal memuat riwayat. Periksa koneksi internetmu.</p>';
    }
}

function checkTodayCheckinStatus() {
    const btnCheckin = document.getElementById('btnDailyCheckin');
    if (!btnCheckin || !loggedInCustomer) return;
    // 🔥 Update Teks Tanggal Kedaluarsa (Simulasi visual)
    const expiryEl = document.getElementById('checkinExpiryText');
    if (expiryEl) {
        const nextMonth = new Date();
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        expiryEl.innerText = `Berakhir ${nextMonth.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}`;
    }


    const todayStr = new Date().toISOString().split('T')[0];
    if (loggedInCustomer.last_checkin === todayStr) {
        btnCheckin.innerText = "✓ Sudah Check-in Hari Ini";
        btnCheckin.disabled = true;
        btnCheckin.className = "w-full py-3 bg-brand-700/80 text-brand-200 border border-brand-500/30 font-black rounded-xl text-xs cursor-not-allowed";
    } else {
        btnCheckin.innerText = "Check-in Hari Ini (+15 Poin)";
        btnCheckin.disabled = false;
        btnCheckin.className = "w-full py-3 bg-amber-400 hover:bg-amber-300 text-brand-900 font-black rounded-xl text-xs transition shadow-lg cursor-pointer";
    }
}

// ======================== DETAIL KALENDER CHECK-IN ========================
function openCheckinDetailModal() {
    if (!loggedInCustomer) {
        showValidationAlert("Silakan login untuk melihat detail check-in.");
        return;
    }

    // 🔥 SESUAIKAN DENGAN SISTEM: +15 Poin / hari, Bonus +50 Poin tiap 7 hari
    let rewards = [];
    for (let i = 1; i <= 28; i++) {
        if (i % 7 === 0) {
            // Hari ke-7, 14, 21, 28 adalah Bonus
            rewards.push({ day: i, type: 'banner', val: 'BONUS +50 Pts' });
        } else {
            // Hari biasa
            rewards.push({ day: i, type: 'pts', val: '+15 Pts' });
        }
    }

    // Hitung status visual berdasarkan streak customer
    const streak = loggedInCustomer.checkin_streak || 0;
    const todayStr = new Date().toISOString().split('T')[0];
    const isCheckedInToday = loggedInCustomer.last_checkin === todayStr;
    
    // Tentukan posisi "Hari Ini" di kalender
    // Jika sudah checkin hari ini, berarti posisi hari ini adalah sejumlah streak.
    // Jika belum checkin, berarti posisi hari ini adalah streak + 1.
    let currentVisualDay = isCheckedInToday ? streak : streak + 1;
    // Jika streak 0 (baru reset setelah dapat bonus / akun baru), hari ini adalah hari ke-1
    if (currentVisualDay === 0) currentVisualDay = 1; 

    const gridContainer = document.getElementById('checkinCalendarGrid');

    gridContainer.innerHTML = rewards.map((item, index) => {
        const dayNum = index + 1;
        
        // Logic visual: Anggap siklus 7 hari berulang (1-7, 8-14, dst)
        const dayInCycle = ((dayNum - 1) % 7) + 1; 
        
        // Cek apakah hari ini di kalender sudah terlewati atau sedang aktif
        const isChecked = (dayNum < currentVisualDay) || (isCheckedInToday && dayNum === currentVisualDay);
        const isToday = (dayNum === currentVisualDay) && !isCheckedInToday;

        // Desain untuk item biasa (+15 Pts)
        if (item.type === 'pts') {
            const icon = `<i class="fa-solid fa-coins text-xl ${isChecked ? 'text-[#C2833B]' : (isToday ? 'text-gray-600' : 'text-gray-300')}"></i>`;
            return `
                <div class="rounded-xl flex flex-col items-center justify-center py-3 px-1 border ${isChecked ? 'bg-[#F6E8D6] border-[#F6E8D6]' : (isToday ? 'bg-white border-[#C2833B]' : 'bg-white border-gray-200')}">
                    ${isChecked ? '<i class="fa-solid fa-circle-check text-[#C2833B] text-xl"></i>' : icon}
                    <span class="font-extrabold text-[11px] mt-1 ${isChecked ? 'text-[#C2833B]' : (isToday ? 'text-gray-700' : 'text-gray-400')}">${item.val}</span>
                    <span class="text-[9px] font-semibold mt-0.5 ${isChecked ? 'text-[#C2833B]' : 'text-gray-400'}">Hari ke-${dayNum}</span>
                </div>
            `;
        }

        // Desain untuk Banner (Bonus +50 Pts)
        if (item.type === 'banner') {
            return `
                <div class="col-span-3 rounded-xl flex flex-col items-center justify-center py-4 px-2 border ${isChecked ? 'bg-[#F6E8D6] border-[#F6E8D6]' : (isToday ? 'bg-white border-[#C2833B]' : 'bg-white border-gray-200')}">
                    ${isChecked ? '<i class="fa-solid fa-circle-check text-[#C2833B] text-2xl mb-1"></i>' : '<i class="fa-solid fa-gift text-gray-300 text-2xl mb-1"></i>'}
                    <span class="font-extrabold text-sm ${isChecked ? 'text-[#C2833B]' : (isToday ? 'text-gray-700' : 'text-gray-400')}">${item.val}</span>
                    <span class="text-[9px] font-semibold mt-1 ${isChecked ? 'text-[#C2833B]' : 'text-gray-400'}">Hari ke-${dayNum} (Streak 7 Hari)</span>
                </div>
            `;
        }
    }).join('');

    openModal('checkinDetailModal');
    // Efek animasi pop-up
    setTimeout(() => {
        const content = document.getElementById('checkinDetailContent');
        if(content) {
            content.style.transform = 'scale(1)';
            content.style.opacity = '1';
        }
    }, 10);
}

async function doDailyCheckin() {
    if (!loggedInCustomer) return;

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    if (loggedInCustomer.last_checkin === todayStr) {
        showToast("Kamu sudah melakukan check-in hari ini!");
        return;
    }

    // Hitung streak harian
    let streak = loggedInCustomer.checkin_streak || 0;
    let earnedPoints = 15; // Poin harian dasar

    if (loggedInCustomer.last_checkin) {
        const lastDate = new Date(loggedInCustomer.last_checkin);
        const diffTime = Math.abs(today - lastDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays === 1) {
            streak += 1;
        } else if (diffDays > 1) {
            // Reset streak karena bolong 1 hari atau lebih
            streak = 1;
        }
    }

    // Bonus konsisten 1 minggu (7 hari) = +50 poin
    if (streak >= 7) {
        earnedPoints += 50;
        streak = 0; // Reset streak setelah bonus 1 minggu diklaim
        showToast("🎉 Selamat! Bonus konsisten 1 minggu (+50 Poin) berhasil diklaim!");
    }

    loggedInCustomer.checkin_streak = streak;
    loggedInCustomer.last_checkin = todayStr;
    await addPointBatchWithExpiry(earnedPoints, 'Check-in Harian');

    try {
        await supabaseClient
            .from('customers')
            .update({
                points: loggedInCustomer.points,
                checkin_streak: loggedInCustomer.checkin_streak,
                last_checkin: loggedInCustomer.last_checkin
            })
            .eq('id', loggedInCustomer.id);

        localStorage.setItem('ngopa_customer', JSON.stringify(loggedInCustomer));
        renderAccountModalUI();
        renderPointExpiryUI();
        updateCartUI();
        const expStr = formatDateDDMMYYYY(addTwoMonthsDate(today));
        showToast(`Check-in berhasil! +${earnedPoints} Poin (Berlaku s/d ${expStr}).`);
    } catch (err) {
        console.error(err);
        showToast("Gagal menyimpan check-in ke database.");
    }
}

function toggleUsePoints() {
    if (!loggedInCustomer || loggedInCustomer.points <= 0) return;
    isUsingPoints = !isUsingPoints;
    const btn = document.getElementById('btnTogglePoints');
    if (isUsingPoints) {
        btn.innerText = "Batalkan Poin";
        btn.className = "px-3 py-1.5 bg-rose-500 text-white font-black rounded-xl text-[10px] transition shadow cursor-pointer";
        showToast("Diskon poin berhasil diterapkan di keranjang!");
    } else {
        btn.innerText = "Pakai Poin";
        btn.className = "px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-brand-900 font-black rounded-xl text-[10px] transition shadow cursor-pointer";
        showToast("Diskon poin dibatalkan.");
    }
    updateCartUI();
}

document.addEventListener('DOMContentLoaded', async function () {
    await fetchDynamicConfigsFromDB();
    renderCategories();
    await renderMenu();
    await renderOutlets();
    renderWifiDisplay();
    showDailyAnnouncementPopup();
    checkAdminAccess();
    initCustomSelect();
    populatePickupTime();
    
    const floatCart = document.getElementById('floatingCart');
    const floatTop = document.getElementById('floatingTopBtn');
    window.addEventListener('scroll', function () {
        if (window.scrollY > 300) { floatTop.classList.add('visible'); } else { floatTop.classList.remove('visible'); }
    });

    if (loggedInCustomer) {
        // 🔥 TARIK & REKONSILIASI POIN TERBARU DARI DATABASE (TERMASUK ORDER SELESAI YANG BELUM MASUK SALDO)
        await syncCustomerPointsFromDB();
        renderAccountModalUI();
        renderAnnouncementCheckinUI();
        const nameInput = document.getElementById('custName');
        const phoneInput = document.getElementById('custPhone');
        if (nameInput && !nameInput.value && loggedInCustomer.name) nameInput.value = loggedInCustomer.name;
        if (phoneInput && !phoneInput.value && loggedInCustomer.phone) phoneInput.value = loggedInCustomer.phone;
        await syncCustomerLoyaltyDiscount(loggedInCustomer.phone);
    }
    checkReferralRegistrationRedirect();
    updateCartUI();
});

// ======================== ANNOUNCEMENT POPUP LOGIC (SUPABASE INTEGRATED) ========================
async function showDailyAnnouncementPopup() {
    const modal = document.getElementById('dailyAnnouncementModal');
    if (!modal) return;

    // Default fallback data jika tabel Supabase belum ada
    let annData = {
        title: "Voucher Sedang Habis",
        message: "Mohon maaf, saat ini stok voucher diskon sedang habis dan sedang menunggu restock. Order online akan segera dibuka kembali setelah stok voucher tersedia. Terima kasih sudah sabar menunggu!",
        status: "voucher_empty", // Pilihan status: 'open', 'closed', 'maintenance', 'traveling', 'vacation', 'voucher_empty'
        operating_days: "Jumat - Minggu",
        opening_hours: "08:00 - 23:20 WIB",
        reopen_estimation: "Jika stok ready!",
        reopen_label: "Perkiraan Buka Kembali"
    };

    try {
        // Integrasi Supabase: Mengambil data dari tabel 'announcements'
        const { data, error } = await supabaseClient
            .from('announcements')
            .select('*')
            .eq('is_active', true)
            .limit(1)
            .maybeSingle();

        if (data && !error) {
            annData = { ...annData, ...data };
        }
    } catch (err) {
        console.log("Menggunakan data pengumuman default (tabel Supabase belum dibuat).");
    }

    // Render status badge dan ikon berdasarkan kondisi toko
    let badgeHtml = '';
    let iconClass = 'fa-bullhorn';

    switch (annData.status) {
        case 'maintenance':
            badgeHtml = '<span class="bg-amber-500 text-brand-900 text-[9px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">SEDANG MAINTENANCE</span>';
            iconClass = 'fa-screwdriver-wrench';
            break;
        case 'closed':
            badgeHtml = '<span class="bg-rose-500 text-white text-[9px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">TOKO MASIH TUTUP</span>';
            iconClass = 'fa-store-slash';
            break;
        case 'traveling':
            badgeHtml = '<span class="bg-blue-500 text-white text-[9px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">ADMIN DI PERJALANAN</span>';
            iconClass = 'fa-car';
            break;
        case 'vacation':
            badgeHtml = '<span class="bg-purple-500 text-white text-[9px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">ADMIN MASIH LIBURAN</span>';
            iconClass = 'fa-umbrella-beach';
            break;
        case 'voucher_empty':
            badgeHtml = '<span class="bg-amber-400 text-brand-900 text-[9px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">VOUCHER SEDANG HABIS</span>';
            iconClass = 'fa-ticket';
            break;
        default:
            badgeHtml = '<span class="bg-emerald-500 text-white text-[9px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">TOKO BUKA</span>';
            iconClass = 'fa-store';
            break;
    }

    document.getElementById('announcementStatusBadge').innerHTML = badgeHtml;
    document.getElementById('announcementTitle').innerText = annData.title;
    document.getElementById('announcementMessage').innerText = annData.message;
    document.getElementById('announcementSchedule').innerText = `${annData.operating_days}, ${annData.opening_hours}`;
    
    const iconEl = document.getElementById('announcementIcon');
    if (iconEl) iconEl.className = `fa-solid ${iconClass} text-amber-400 text-2xl`;

                const estimationBox = document.getElementById('announcementEstimationBox');
    // 🔥 Tampilkan asalkan ada teks isinya, tanpa peduli status toko
    if (annData.reopen_estimation && annData.reopen_estimation.trim() !== '') {
        estimationBox.style.display = 'block';
        
        // 🔥 Update Label Judul dari Database
        const estimationLabelEl = document.getElementById('announcementEstimationLabel');
        if (estimationLabelEl) {
            estimationLabelEl.innerText = annData.reopen_label || 'Perkiraan Buka Kembali';
        }

        // Update Isi Teks
        document.getElementById('announcementEstimationText').innerText = annData.reopen_estimation;
    } else {
        estimationBox.style.display = 'none';
    }

    renderAnnouncementCheckinUI();
    modal.classList.remove('hidden');
}

function closeDailyAnnouncement() {
    const modal = document.getElementById('dailyAnnouncementModal');
    if (modal) {
        modal.classList.add('hidden');
    }
}
// ======================== CHECK-IN DARI ANNOUNCEMENT ========================
function renderAnnouncementCheckinUI() {
const notLogged = document.getElementById('announcementNotLoggedIn');
const logged = document.getElementById('announcementLoggedIn');
if (!notLogged || !logged) return;

if (loggedInCustomer) {
    notLogged.classList.add('hidden');
    logged.classList.remove('hidden');
    document.getElementById('announcementUserName').innerText = loggedInCustomer.name || loggedInCustomer.phone || '';
    document.getElementById('announcementUserPoints').innerText = loggedInCustomer.points || 0;
    document.getElementById('announcementUserStreak').innerText = loggedInCustomer.checkin_streak || 0;

    const btn = document.getElementById('announcementCheckinBtn');
    const todayStr = new Date().toISOString().split('T')[0];
    if (loggedInCustomer.last_checkin === todayStr) {
        btn.innerText = "✓ Sudah Check-in Hari Ini";
        btn.disabled = true;
        btn.className = "w-full py-2.5 bg-brand-700/80 text-brand-200 border border-brand-500/30 font-black rounded-xl text-xs cursor-not-allowed";
    } else {
        btn.innerText = "Check-in Hari Ini (+15 Poin)";
        btn.disabled = false;
        btn.className = "w-full py-2.5 bg-amber-400 hover:bg-amber-300 text-brand-900 font-black rounded-xl text-xs transition shadow cursor-pointer";
    }
} else {
    notLogged.classList.remove('hidden');
    logged.classList.add('hidden');
}
}

async function doDailyCheckinFromAnnouncement() {
await doDailyCheckin();
renderAnnouncementCheckinUI();
}

// ======================== FUNGSI WAKTU PICKUP ========================

function populatePickupTime() {
    const hourSelect = document.getElementById('pickupHour');
    if (!hourSelect) return;

    // Kosongkan dropdown
    hourSelect.innerHTML = '';

    // Generate jam dari 00 sampai 23 (HANYA ANGKA JAM, tanpa ":00")
    for (let i = 0; i < 24; i++) {
        const hour = String(i).padStart(2, '0');
        const option = document.createElement('option');
        option.value = hour;
        option.textContent = hour; // HANYA angka jam, bukan "00:00"
        hourSelect.appendChild(option);
    }

    // Set default ke jam saat ini + 1 jam
    const now = new Date();
    let currentHour = now.getHours();
    let currentMinute = now.getMinutes();

    // Tambah 1 jam
    currentHour = (currentHour + 1) % 24;

    // Jika menit > 45, tambah 1 jam lagi
    if (currentMinute > 45) {
        currentHour = (currentHour + 1) % 24;
    }

    // Set default hour
    hourSelect.value = String(currentHour).padStart(2, '0');

    // Set default minute ke 00, 15, 30, atau 45 (pembulatan)
    const minuteSelect = document.getElementById('pickupMinute');
    if (minuteSelect) {
        if (currentMinute <= 15) {
            minuteSelect.value = '00';
        } else if (currentMinute <= 30) {
            minuteSelect.value = '30';
        } else if (currentMinute <= 45) {
            minuteSelect.value = '45';
        } else {
            minuteSelect.value = '00';
        }
    }
}
// ======================== KATEGORI POPUP ========================

function openCategoryModal() {
    renderCategoryModal();
    openModal('categoryModal');
}

function renderCategoryModal() {
    const list = document.getElementById('categoryModalList');
    const label = document.getElementById('categoryBrandLabel');
    if (!list) return;

    const currentCatList = brandCategories[selectedBrand] || ['Semua', 'Kopi', 'Non-Kopi', 'Paket Hemat'];
    label.textContent = `(${selectedBrand})`;

    // Fungsi helper untuk icon
    function getCategoryIcon(catName) {
        const name = catName.toLowerCase();
        if (name.includes('semua')) return 'fa-solid fa-th-large';
        if (name.includes('kopi') || name.includes('coffee')) return 'fa-solid fa-mug-hot';
        if (name.includes('non-kopi') || name.includes('non coffee')) return 'fa-solid fa-glass-water';
        if (name.includes('paket') || name.includes('bundling')) return 'fa-solid fa-gift';
        if (name.includes('snack') || name.includes('food')) return 'fa-solid fa-utensils';
        if (name.includes('pasta')) return 'fa-solid fa-bowl-food';
        if (name.includes('nasi')) return 'fa-solid fa-bowl-rice';
        if (name.includes('ayam')) return 'fa-solid fa-drumstick-bite';
        if (name.includes('korean')) return 'fa-solid fa-bowl-hot';
        if (name.includes('tea') || name.includes('thai')) return 'fa-solid fa-mug-saucer';
        if (name.includes('matcha')) return 'fa-solid fa-leaf';
        if (name.includes('frappe') || name.includes('blended')) return 'fa-solid fa-snowflake';
        if (name.includes('series')) return 'fa-solid fa-list-ul';
        if (name.includes('deli')) return 'fa-solid fa-bread-slice';
        if (name.includes('junior')) return 'fa-solid fa-child';
        if (name.includes('signature')) return 'fa-solid fa-star';
        if (name.includes('refresher')) return 'fa-solid fa-wine-bottle';
        if (name.includes('1l')) return 'fa-solid fa-flask';
        return 'fa-solid fa-tag';
    }

    list.innerHTML = currentCatList.map(cat => {
        const iconClass = getCategoryIcon(cat);
        const isActive = currentCategory === cat;
        return `
    <div onclick="selectCategoryFromModal('${cat}')" 
         class="flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all duration-200 hover:bg-brand-50 dark:hover:bg-brand-800 border border-transparent hover:border-brand-200 dark:hover:border-brand-700 ${isActive ? 'bg-brand-50 dark:bg-brand-800 border-brand-200 dark:border-brand-700' : ''}">
        <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-xl bg-brand-100 dark:bg-brand-700 flex items-center justify-center text-brand-500">
                <i class="${iconClass} text-xs"></i>
            </div>
            <span class="font-bold text-sm text-brand-900 dark:text-white">${cat}</span>
        </div>
        ${isActive ? '<i class="fa-solid fa-check-circle text-amber-400"></i>' : '<i class="fa-solid fa-chevron-right text-gray-300"></i>'}
    </div>
`;
    }).join('');
}

function selectCategoryFromModal(cat) {
    setCategory(cat);
    closeModal('categoryModal');
    showToast(`Menampilkan: ${cat}`);

    // 🔥 SCROLL KE KATEGORI CONTAINER SETELAH MODAL TERTUTUP
    setTimeout(() => {
        const container = document.getElementById('categoryContainer');
        if (container) {
            const headerHeight = document.querySelector('header')?.offsetHeight || 70;
            const targetPosition = container.getBoundingClientRect().top + window.pageYOffset - headerHeight - 10;

            window.scrollTo({
                top: Math.max(0, targetPosition),
                behavior: 'smooth'
            });
        }
    }, 350);
}

function showOutOfStockWarning(itemName) {
    const msgEl = document.getElementById('outOfStockMessage');
    if (msgEl) {
        msgEl.innerHTML = `Mohon maaf kak, menu <strong class="text-amber-400 font-bold">${itemName}</strong> sedang kosong atau habis di outlet ini. Silakan pilih menu lain yang tak kalah enak ya! ☕`;
    }
    openModal('outOfStockModal');
}

function isBundlingDrinkAndFood(item) {
    if (!item) return false;
    const name = (item.name || '').toLowerCase();
    return name.includes('bundling drink & food') || name.includes('couple') || name.includes('satnight');
}

// ======================== 1 & 2. SISTEM KADALUARSA POIN (MAKS 2 BULAN / DD-MM-YYYY) & CASHBACK LEVEL ========================
const POINT_EXPIRY_MONTHS = 2;

function addTwoMonthsDate(dateInput) {
    const d = new Date(dateInput || Date.now());
    d.setMonth(d.getMonth() + POINT_EXPIRY_MONTHS);
    return d;
}

function formatDateDDMMYYYY(dateInput) {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return '-';
    const day = String(d.getDate()).padStart(2, '0');
    const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    const month = monthNames[d.getMonth()];
    const year = d.getFullYear();
    return `${day} ${month} ${year}`;
}

function getCustomerPointBatchesKey(phone) {
    const clean = String(phone || loggedInCustomer?.phone || '').replace(/[^0-9]/g, '');
    return `ngopa_point_batches_${clean}`;
}

function loadAndCleanExpiredPointBatches(phone) {
    const targetPhone = phone || loggedInCustomer?.phone;
    if (!targetPhone) return [];
    const key = getCustomerPointBatchesKey(targetPhone);
    let batches = [];
    try {
        batches = JSON.parse(localStorage.getItem(key) || '[]');
        if (!Array.isArray(batches)) batches = [];
    } catch (e) { batches = []; }

    const now = new Date();
    if (batches.length === 0 && loggedInCustomer && Number(loggedInCustomer.points) > 0) {
        const earnedAt = loggedInCustomer.last_checkin ? new Date(loggedInCustomer.last_checkin) : now;
        const expiresAt = addTwoMonthsDate(earnedAt);
        batches.push({
            id: 'init-' + Date.now(),
            source: 'Poin Awal Aktif',
            amount: Number(loggedInCustomer.points),
            remaining: Number(loggedInCustomer.points),
            earned_at: earnedAt.toISOString(),
            expires_at: expiresAt.toISOString()
        });
    }

    let expiredPointsTotal = 0;
    const validBatches = batches.filter(b => {
        const expDate = new Date(b.expires_at);
        const isExpired = now > expDate;
        if (isExpired && Number(b.remaining) > 0) {
            expiredPointsTotal += Number(b.remaining);
        }
        return !isExpired && Number(b.remaining) > 0;
    });

    let activeTotal = validBatches.reduce((sum, b) => sum + (Number(b.remaining) || 0), 0);

    if (loggedInCustomer && String(loggedInCustomer.phone) === String(targetPhone)) {
        if (expiredPointsTotal > 0) {
            loggedInCustomer.points = Math.max(0, (loggedInCustomer.points || 0) - expiredPointsTotal);
            localStorage.setItem('ngopa_customer', JSON.stringify(loggedInCustomer));
            supabaseClient.from('customers').update({ points: loggedInCustomer.points }).eq('id', loggedInCustomer.id).then(() => {});
            showToast(`⚠️ ${expiredPointsTotal} Poin hangus karena melewati batas 2 bulan.`);
            logPointActivity('out', expiredPointsTotal, 'Poin Kadaluarsa (Hangus)', loggedInCustomer.points);
        } 
        // 🔥 PERBAIKAN: Jika Database (loggedInCustomer.points) lebih besar dari LocalStorage (activeTotal)
        else if (Number(loggedInCustomer.points) > activeTotal) {
            const diff = Number(loggedInCustomer.points) - activeTotal;
            const expiresAt = addTwoMonthsDate(now);
            validBatches.push({
                id: 'sync-' + Date.now(),
                source: 'Cashback Order Selesai / Sinkronisasi',
                amount: diff,
                remaining: diff,
                earned_at: now.toISOString(),
                expires_at: expiresAt.toISOString()
            });
            activeTotal = Number(loggedInCustomer.points);
            logPointActivity('in', diff, 'Cashback Order Selesai (Sinkronisasi DB)', activeTotal, expiresAt, `sync-in-${activeTotal}-${diff}`);
        }
        // 🔥 PERBAIKAN: Jika Database (loggedInCustomer.points) lebih kecil dari LocalStorage (activeTotal)
        else if (Number(loggedInCustomer.points) < activeTotal) {
            let diffToReduce = activeTotal - Number(loggedInCustomer.points);
            for (let i = validBatches.length - 1; i >= 0 && diffToReduce > 0; i--) {
                const rem = Number(validBatches[i].remaining) || 0;
                if (rem <= diffToReduce) {
                    diffToReduce -= rem;
                    validBatches[i].remaining = 0;
                } else {
                    validBatches[i].remaining = rem - diffToReduce;
                    diffToReduce = 0;
                }
            }
            activeTotal = Number(loggedInCustomer.points);
        }
    }

    localStorage.setItem(key, JSON.stringify(validBatches));
    return validBatches;
}

async function addPointBatchWithExpiry(amount, sourceLabel) {
    const pts = Math.round(Number(amount) || 0);
    if (!loggedInCustomer || pts <= 0) return;

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const expiresAt = addTwoMonthsDate(now);
    const batches = loadAndCleanExpiredPointBatches(loggedInCustomer.phone);
    const isCheckin = String(sourceLabel || '').toLowerCase().includes('check-in');
    const batchId = isCheckin ? `batch-checkin-${todayStr}` : ('pt-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6));
    const logId = isCheckin ? `checkin-${todayStr}` : null;

    if (!batches.some(b => b.id === batchId)) {
        batches.push({
            id: batchId,
            source: sourceLabel || 'Reward Poin',
            amount: pts,
            remaining: pts,
            earned_at: now.toISOString(),
            expires_at: expiresAt.toISOString()
        });
    }

    const key = getCustomerPointBatchesKey(loggedInCustomer.phone);
    localStorage.setItem(key, JSON.stringify(batches));

    const newTotal = batches.reduce((sum, b) => sum + (Number(b.remaining) || 0), 0);
    loggedInCustomer.points = newTotal;
    localStorage.setItem('ngopa_customer', JSON.stringify(loggedInCustomer));

    try {
        await supabaseClient
            .from('customers')
            .update({ points: newTotal })
            .eq('id', loggedInCustomer.id);
    } catch (e) {
        console.error('Gagal sinkronisasi poin ke Supabase:', e);
    }

    // 🔥 Kirim expiresAt & customId ke log aktivitas agar sinkron dengan tanggal check-in
    logPointActivity('in', pts, sourceLabel || 'Reward Poin', newTotal, expiresAt, logId, now.toISOString(), 'active');

    renderPointExpiryUI();
}

function consumePointsFIFO(pointsToUse) {
    if (!loggedInCustomer || pointsToUse <= 0) return;
    let remainingToDeduct = Number(pointsToUse);
    const batches = loadAndCleanExpiredPointBatches(loggedInCustomer.phone);

    batches.sort((a, b) => new Date(a.expires_at) - new Date(b.expires_at));

    for (const batch of batches) {
        if (remainingToDeduct <= 0) break;
        const avail = Number(batch.remaining) || 0;
        if (avail <= remainingToDeduct) {
            remainingToDeduct -= avail;
            batch.remaining = 0;
        } else {
            batch.remaining = avail - remainingToDeduct;
            remainingToDeduct = 0;
        }
    }

    const updatedBatches = batches.filter(b => Number(b.remaining) > 0);
    const key = getCustomerPointBatchesKey(loggedInCustomer.phone);
    localStorage.setItem(key, JSON.stringify(updatedBatches));

    const newTotal = updatedBatches.reduce((sum, b) => sum + (Number(b.remaining) || 0), 0);
    loggedInCustomer.points = newTotal;
    localStorage.setItem('ngopa_customer', JSON.stringify(loggedInCustomer));
    
    // 🔥 TAMBAHKAN INI: Mencatat log poin keluar (dipakai checkout)
    logPointActivity('out', Number(pointsToUse), 'Potongan Harga Checkout', newTotal);

    renderPointExpiryUI();
}

function renderPointExpiryUI() {
    const summaryEl = document.getElementById('dashPointExpirySummary');
    const listEl = document.getElementById('dashPointBatchList');
    const cartExpEl = document.getElementById('cartPointsExpiryInfo');
    const annExpEl = document.getElementById('announcementPointExpiryText');

    if (!loggedInCustomer) return;
    const batches = loadAndCleanExpiredPointBatches(loggedInCustomer.phone);

    if (batches.length === 0) {
        if (summaryEl) summaryEl.innerText = 'Belum ada poin aktif. Setiap poin dari Check-in Harian & Cashback Level berlaku maksimal 2 bulan.';
        if (listEl) listEl.innerHTML = '';
        if (cartExpEl) cartExpEl.innerText = 'Masa berlaku poin: maksimal 2 bulan.';
        if (annExpEl) annExpEl.innerText = 'Belum ada poin aktif (Berlaku 2 bulan)';
        return;
    }

    batches.sort((a, b) => new Date(a.expires_at) - new Date(b.expires_at));
    const nearestBatch = batches[0];
    const nearestDateStr = formatDateDDMMYYYY(nearestBatch.expires_at);

    if (summaryEl) {
        summaryEl.innerHTML = `⚠️ <strong>${nearestBatch.remaining} Poin</strong> terdekat akan kadaluarsa pada <strong>${nearestDateStr}</strong> (Hangus otomatis jika lewat 2 bulan).`;
    }
    if (cartExpEl) {
        cartExpEl.innerText = `Kadaluarsa terdekat: ${nearestDateStr} (Maks 2 bulan)`;
    }
    if (annExpEl) {
        annExpEl.innerText = `Exp terdekat: ${nearestDateStr}`;
    }

    if (listEl) {
        listEl.innerHTML = batches.map(b => `
            <div class="flex items-center justify-between bg-brand-900/80 px-2.5 py-1.5 rounded-lg border border-brand-700 text-[10px]">
                <div>
                    <span class="font-extrabold text-amber-400">+${b.remaining} Poin</span>
                    <span class="text-gray-300 ml-1">(${b.source})</span>
                    <span class="block text-[9px] text-gray-400">Diperoleh: ${formatDateDDMMYYYY(b.earned_at)}</span>
                </div>
                <div class="text-right">
                    <span class="text-[9px] text-rose-300 font-bold block">Exp: ${formatDateDDMMYYYY(b.expires_at)}</span>
                </div>
            </div>
        `).join('');
    }
}

function getCashbackRateForCurrentLevel() {
    if (!currentAccountSpendInfo || !currentAccountSpendInfo.currentTier) return 0;
    return Number(currentAccountSpendInfo.currentTier.cashbackRate) || 0;
}

// ======================== 3. FITUR TOGGLE SHARE PAKET HEMAT (RP 2.000 / 1 PCS, 1X PER AKUN) ========================
let currentShareMenuItem = null;
let uploadedShareProofDataUrl = '';
let uploadedShareProofFileName = '';
let isSharePaketHematDiscountActive = false;
let hasAccountUsedSharePromo = false;
let cachedAdminShareProofs = [];

function generatePaketHematReferralLink(menuItem) {
    const baseUrl = window.location.origin + window.location.pathname;
    const refPhone = (loggedInCustomer?.phone || document.getElementById('custPhone')?.value?.trim() || 'guest').replace(/[^0-9]/g, '');
    const itemId = menuItem?.id || 'bundle';
    return `${baseUrl}?register=1&ref=${encodeURIComponent(refPhone)}&paket_hemat=${encodeURIComponent(itemId)}`;
}

async function checkHasCustomerUsedSharePromo(phone) {
    const cleanPhone = String(phone || loggedInCustomer?.phone || document.getElementById('custPhone')?.value || '').replace(/[^0-9]/g, '');
    if (!cleanPhone || cleanPhone.length < 9) {
        hasAccountUsedSharePromo = false;
        return false;
    }

    // Bersihkan sisa data testing lama di localStorage agar tidak mengunci akun yang baru didaftarkan
    localStorage.removeItem(`ngopa_share_paket_used_${cleanPhone}`);

    try {
        const variants = normalizePhoneVariants(cleanPhone);
        // Murni membaca dari tabel paket_hemat_shares (mengabaikan tabel orders lama & localStorage lama)
        const { data, error } = await supabaseClient
            .from('paket_hemat_shares')
            .select('id, action_type, claim_status, proof_image_url')
            .in('customer_phone', variants)
            .order('created_at', { ascending: false });

        if (!error && Array.isArray(data) && data.length > 0) {
            // Hanya dianggap "Sudah Terpakai" jika sudah pernah selesai dipakai checkout,
            // atau sudah upload bukti foto valid yang sudah dipakai order (dan tidak ditolak admin)
            const usedRow = data.find(row => {
                const statusStr = String(row.claim_status || '').toLowerCase();
                const actionStr = String(row.action_type || '').toLowerCase();
                const isRejected = statusStr.includes('tolak') || statusStr.includes('invalid') || statusStr.includes('reset');
                if (isRejected) return false;
                // Hanya dikunci jika status benar-benar sudah dipakai order/checkout (bukan sekadar "menunggu checkout")
                return statusStr === 'sudah dipakai checkout' || statusStr === 'sudah dipakai' || actionStr === 'used_in_checkout';
            });

            if (usedRow) {
                hasAccountUsedSharePromo = true;
                return true;
            }

            // Jika sudah pernah upload bukti foto yang terverifikasi tapi belum dipakai checkout, otomatis aktifkan diskonnya di keranjang
            const pendingVerifiedRow = data.find(row => {
                const statusStr = String(row.claim_status || '').toLowerCase();
                const actionStr = String(row.action_type || '').toLowerCase();
                const isRejected = statusStr.includes('tolak') || statusStr.includes('invalid') || statusStr.includes('reset');
                return !isRejected && (actionStr === 'verified_with_photo_proof' || Boolean(row.proof_image_url));
            });

            if (pendingVerifiedRow) {
                isSharePaketHematDiscountActive = true;
            }
        }
    } catch (e) {
        console.warn('Gagal cek riwayat share promo dari tabel paket_hemat_shares:', e);
    }

    hasAccountUsedSharePromo = false;
    return false;
}

async function openSharePaketHematModal(menuItem) {
    currentShareMenuItem = menuItem || { id: 'bundle', name: 'Paket Hemat Pilihan', category: 'Paket Hemat' };
    const nameEl = document.getElementById('shareModalMenuName');
    if (nameEl) nameEl.innerText = currentShareMenuItem.name || 'Paket Hemat';

    const linkInput = document.getElementById('shareReferralLinkInput');
    if (linkInput) linkInput.value = generatePaketHematReferralLink(currentShareMenuItem);

    const toggleEl = document.getElementById('toggleShareActiveCheckbox');
    if (toggleEl) toggleEl.checked = true;
    onToggleShareSwitchChange();

    const targetPhone = loggedInCustomer?.phone || document.getElementById('custPhone')?.value?.trim() || '';
    const alreadyUsed = await checkHasCustomerUsedSharePromo(targetPhone);
    const statusBadge = document.getElementById('shareModalClaimStatusBadge');
    const submitBtn = document.getElementById('btnSubmitShareProof');

    if (alreadyUsed) {
        if (statusBadge) {
            statusBadge.className = 'bg-rose-500/20 text-rose-300 border border-rose-400/40 text-[9px] font-black px-2.5 py-1 rounded-full shrink-0';
            statusBadge.innerText = 'Sudah Terpakai';
        }
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerText = 'Diskon sudah Terpakai';
            submitBtn.className = 'py-2.5 bg-gray-600 text-gray-300 font-black rounded-xl text-xs cursor-not-allowed';
        }
    } else {
        if (statusBadge) {
            statusBadge.className = 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 text-[9px] font-black px-2.5 py-1 rounded-full shrink-0';
            statusBadge.innerText = 'Tersedia 1x klaim';
        }
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerText = 'Verifikasi & Klaim Rp2.000';
            submitBtn.className = 'py-2.5 bg-amber-400 hover:bg-amber-300 text-brand-900 font-black rounded-xl text-xs shadow-lg cursor-pointer';
        }
    }

    openModal('sharePaketHematModal');
}

function onToggleShareSwitchChange() {
    const toggleEl = document.getElementById('toggleShareActiveCheckbox');
    const boxEl = document.getElementById('shareLinkAreaBox');
    if (!toggleEl || !boxEl) return;
    if (toggleEl.checked) {
        boxEl.classList.remove('opacity-40', 'pointer-events-none');
    } else {
        boxEl.classList.add('opacity-40', 'pointer-events-none');
    }
}

async function recordShareLinkActivityToDB(actionType, extraFields = {}) {
    const shareLink = document.getElementById('shareReferralLinkInput')?.value || generatePaketHematReferralLink(currentShareMenuItem);
    const phone = loggedInCustomer?.phone || document.getElementById('custPhone')?.value?.trim() || 'guest';
    const custName = loggedInCustomer?.name || document.getElementById('custName')?.value?.trim() || 'Customer';
    const params = new URLSearchParams(window.location.search);
    const refBy = params.get('ref') || localStorage.getItem('ngopa_referred_by') || null;
    // Penentuan akun baru didasarkan pada apakah akun tersebut belum pernah klaim bukti foto share di paket_hemat_shares (mengabaikan riwayat tabel orders lama)
    let isNewAcc = true;
    try {
        const variants = normalizePhoneVariants(phone);
        if (variants.length > 0) {
            const { data: prevShares } = await supabaseClient
                .from('paket_hemat_shares')
                .select('id, action_type, claim_status')
                .in('customer_phone', variants)
                .in('action_type', ['verified_with_photo_proof', 'used_in_checkout']);
            if (Array.isArray(prevShares) && prevShares.length > 0) {
                isNewAcc = false;
            }
        }
    } catch (e) {}

    const fullPayload = {
        customer_name: custName,
        customer_phone: phone,
        is_new_account: isNewAcc,
        referred_by_phone: refBy,
        menu_name: currentShareMenuItem?.name || 'Bundling Drink & Food',
        share_link: shareLink,
        proof_image_url: extraFields.proof_image_url || null,
        proof_file_name: extraFields.proof_file_name || null,
        discount_amount: 2000,
        claim_status: extraFields.claim_status || (actionType === 'verified_with_photo_proof' ? 'Terverifikasi' : ' Klik Share'),
        action_type: actionType,
        created_at: new Date().toISOString()
    };

    // Simpan ke riwayat lokal juga sebagai cadangan jika koneksi / kolom database belum di-migrate
    try {
        const localList = JSON.parse(localStorage.getItem('ngopa_share_proofs_history') || '[]');
        localList.unshift({ id: 'local-' + Date.now(), ...fullPayload });
        localStorage.setItem('ngopa_share_proofs_history', JSON.stringify(localList.slice(0, 50)));
    } catch (err) {}

    localStorage.setItem(`ngopa_last_share_link_${phone.replace(/[^0-9]/g, '')}`, JSON.stringify(fullPayload));

    try {
        const { error } = await supabaseClient.from('paket_hemat_shares').insert([fullPayload]);
        if (error) {
            // Fallback ke kolom minimal jika tabel lama belum memiliki kolom baru
            const minimalPayload = {
                customer_phone: phone,
                menu_name: fullPayload.menu_name,
                share_link: shareLink,
                action_type: actionType,
                created_at: fullPayload.created_at
            };
            await supabaseClient.from('paket_hemat_shares').insert([minimalPayload]);
        }
    } catch (e) {
        console.warn('Gagal insert ke tabel paket_hemat_shares:', e);
    }
}

async function recordNewAccountReferralRegistration(newCustomerObj) {
    if (!newCustomerObj) return;
    const params = new URLSearchParams(window.location.search);
    const refBy = params.get('ref') || localStorage.getItem('ngopa_referred_by') || '';
    const payload = {
        customer_name: newCustomerObj.name || 'Akun Baru',
        customer_phone: newCustomerObj.phone || '',
        is_new_account: true,
        referred_by_phone: refBy || null,
        menu_name: 'Registrasi Akun Baru (Via Link Share)',
        share_link: window.location.href,
        proof_image_url: null,
        proof_file_name: null,
        discount_amount: 2000,
        claim_status: 'Akun Baru Terdaftar',
        action_type: 'new_account_registered',
        created_at: new Date().toISOString()
    };
    try {
        const localList = JSON.parse(localStorage.getItem('ngopa_share_proofs_history') || '[]');
        localList.unshift({ id: 'reg-' + Date.now(), ...payload });
        localStorage.setItem('ngopa_share_proofs_history', JSON.stringify(localList.slice(0, 50)));
        await supabaseClient.from('paket_hemat_shares').insert([payload]);
    } catch (e) {}
}

function copySharePaketHematLink() {
    const linkInput = document.getElementById('shareReferralLinkInput');
    if (!linkInput) return;
    navigator.clipboard.writeText(linkInput.value).then(() => {
        showToast('Link Share Paket Hemat berhasil disalin! Bagikan ke temanmu & screenshot buktinya.');
    });
    recordShareLinkActivityToDB('copy_link');
}

function sharePaketHematViaWA() {
    const link = document.getElementById('shareReferralLinkInput')?.value || generatePaketHematReferralLink(currentShareMenuItem);
    const menuName = currentShareMenuItem?.name || 'Paket Hemat';
    const waText = `Yuk daftarkan segera ke ngopangopiae.web.id & cobain *${menuName}* di *Ngopa Ngopi Ae*! Ngopi murah diskon s/d 50%, buruan klik link dibawah ini buat dapetin promo menarik lainnya!: ${link}`;
    recordShareLinkActivityToDB('share_whatsapp');
    window.open(`https://wa.me/?text=${encodeURIComponent(waText)}`, '_blank');
}

function sharePaketHematNative() {
    const link = document.getElementById('shareReferralLinkInput')?.value || generatePaketHematReferralLink(currentShareMenuItem);
    const menuName = currentShareMenuItem?.name || 'Paket Hemat';
    recordShareLinkActivityToDB('share_native');
    if (navigator.share) {
        navigator.share({
            title: `Promo ${menuName} - Ngopa Ngopi Ae`,
            text: `Yuk daftar akun di Ngopa Ngopi Ae dan pesan ${menuName} hemat!`,
            url: link
        }).catch(() => {});
    } else {
        copySharePaketHematLink();
    }
}

function compressShareImageToDataUrl(file, callback) {
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const maxDim = 900;
            let w = img.width;
            let h = img.height;
            if (w > maxDim || h > maxDim) {
                if (w > h) {
                    h = Math.round((h * maxDim) / w);
                    w = maxDim;
                } else {
                    w = Math.round((w * maxDim) / h);
                    h = maxDim;
                }
            }
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.78);
            callback(compressedDataUrl);
        };
        img.onerror = function() {
            callback(e.target.result);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function handleShareProofFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    uploadedShareProofFileName = file.name;
    compressShareImageToDataUrl(file, function(compressedUrl) {
        uploadedShareProofDataUrl = compressedUrl;
        const previewContainer = document.getElementById('shareProofPreviewContainer');
        const previewImg = document.getElementById('shareProofPreviewImg');
        const fileNameEl = document.getElementById('shareProofFileName');
        if (previewContainer) previewContainer.classList.remove('hidden');
        if (previewImg) previewImg.src = uploadedShareProofDataUrl;
        if (fileNameEl) fileNameEl.innerText = `✓ Bukti Foto Siap Diverifikasi: ${file.name}`;
    });
}

async function submitSharePaketHematClaim() {
    const toggleEl = document.getElementById('toggleShareActiveCheckbox');
    if (toggleEl && !toggleEl.checked) {
        showValidationAlert('Aktifkan toggle Share Paket Hemat terlebih dahulu!');
        return;
    }

    const phone = loggedInCustomer?.phone || document.getElementById('custPhone')?.value?.trim() || '';
    if (!phone || phone.replace(/[^0-9]/g, '').length < 9) {
        showValidationAlert('Silahkan login akun atau isi Nomor HP terlebih dahulu agar klaim dapat diverifikasi!');
        return;
    }

    const alreadyUsed = await checkHasCustomerUsedSharePromo(phone);
    if (alreadyUsed) {
        showValidationAlert('Mohon maaf, promo Diskon Share Paket Hemat Rp2.000 hanya berlaku 1x untuk setiap akun dan akunmu sudah pernah menggunakannya.');
        return;
    }

    if (!uploadedShareProofDataUrl) {
        showValidationAlert('Harap lampirkan bukti foto (screenshot) bahwa kamu sudah membagikan link Paket Hemat tersebut kepada teman!');
        return;
    }

    isSharePaketHematDiscountActive = true;
    await recordShareLinkActivityToDB('verified_with_photo_proof', {
        proof_image_url: uploadedShareProofDataUrl,
        proof_file_name: uploadedShareProofFileName || 'bukti-share.jpg',
        claim_status: 'Terverifikasi (Menunggu Checkout)'
    });
    closeModal('sharePaketHematModal');
    updateCartUI();
    showToast('🎉 Bukti Share berhasil disimpan ke database & Diskon Rp2.000 otomatis diterapkan di keranjang!');
}

// ======================== FUNGSI TABEL DATABASE & PENGECEKAN BUKTI FOTO SHARE (ADMIN) ========================
function openSqlShareTableHelperModal() {
    openModal('sqlShareTableHelperModal');
}

function copySqlShareTableScript() {
    const sqlEl = document.getElementById('supabaseShareTableSqlText');
    if (!sqlEl) return;
    navigator.clipboard.writeText(sqlEl.value).then(() => {
        showToast('Query SQL tabel paket_hemat_shares berhasil disalin!');
    });
}

async function loadAdminShareProofs() {
    const tbodyPanel = document.getElementById('adminShareProofTableBody');
    const tbodyUrl = document.getElementById('adminUrlShareProofTableBody');

    let dbRows = [];
    try {
        const { data, error } = await supabaseClient
            .from('paket_hemat_shares')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100);
        if (!error && Array.isArray(data)) {
            dbRows = data;
        }
    } catch (e) {
        console.warn('Gagal memuat tabel paket_hemat_shares dari Supabase:', e);
    }

    // Gunakan murni data dari tabel Supabase paket_hemat_shares (abaikan localStorage testing lama jika tabel Supabase aktif)
    cachedAdminShareProofs = dbRows.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    const renderRowsHtml = (rows) => {
        if (!rows || rows.length === 0) {
            return `<tr><td colspan="6" style="text-align:center; color:#9ca3af; padding:20px;">Belum ada data klaim bukti foto share atau registrasi referral.</td></tr>`;
        }
        return rows.map((row, idx) => {
            const dateStr = row.created_at ? new Date(row.created_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : '-';
            const custName = row.customer_name || 'Customer';
            const custPhone = row.customer_phone || '-';
            const isNewBadge = row.is_new_account
                ? `<span style="background:#10B981; color:#0D2213; font-size:9px; font-weight:900; padding:2px 6px; border-radius:8px; margin-left:4px;">AKUN BARU</span>`
                : `<span style="background:#3B82F6; color:white; font-size:9px; font-weight:800; padding:2px 6px; border-radius:8px; margin-left:4px;">MEMBER</span>`;
            const refInfo = row.referred_by_phone
                ? `<div style="font-size:10px; color:#fde047; margin-top:2px;">Ref dari: ${row.referred_by_phone}</div>`
                : '';
            const menuName = row.menu_name || 'Bundling Drink & Food';
            const hasProof = Boolean(row.proof_image_url);
            const proofCellHtml = hasProof
                ? `<div style="display:flex; align-items:center; gap:8px;">
                       <img src="${row.proof_image_url}" alt="Bukti" onclick="showDirectImagePreview('${row.proof_image_url}', '${custName}', '${custPhone}')" style="width:60px; height:60px; object-fit:cover; border-radius:8px; border:2px solid #FFC107; cursor:pointer; background:#fff;" title="Klik untuk perbesar bukti foto" />
                       <button type="button" onclick="showDirectImagePreview('${row.proof_image_url}', '${custName}', '${custPhone}')" style="background:#FFC107; color:#0D2213; border:none; padding:6px 10px; border-radius:8px; font-size:11px; font-weight:900; cursor:pointer;">
                           <i class="fa-solid fa-magnifying-glass-plus"></i> Cek Foto
                       </button>
                   </div>`
                : `<span style="color:#9ca3af; font-size:10px;">${row.action_type === 'new_account_registered' ? 'Registrasi via Link' : 'Belum upload foto'}</span>`;

            const statusText = row.claim_status || (hasProof ? 'Terverifikasi' : (row.action_type || 'Share Link'));
            const isRejected = statusText.toLowerCase().includes('tolak') || statusText.toLowerCase().includes('invalid');
            const statusBadgeStyle = isRejected
                ? 'background:#ef4444; color:white;'
                : (hasProof ? 'background:#10B981; color:#0D2213;' : 'background:#374151; color:#e5e7eb;');

            return `
                <tr>
                    <td style="color:#9ca3af; font-size:11px; white-space:nowrap;">${dateStr}</td>
                    <td>
                        <div style="font-weight:800; color:white;">${custName} ${isNewBadge}</div>
                        <div style="color:#9ca3af; font-size:11px;">${custPhone}</div>
                        ${refInfo}
                    </td>
                    <td>
                        <div style="font-weight:700; color:#FFC107;">${menuName}</div>
                        <div style="color:#9ca3af; font-size:10px; max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${row.share_link || ''}">${row.share_link || '-'}</div>
                    </td>
                    <td>${proofCellHtml}</td>
                    <td>
                        <span style="${statusBadgeStyle} padding:3px 8px; border-radius:10px; font-size:10px; font-weight:900; display:inline-block;">
                            ${statusText}
                        </span>
                    </td>
                    <td>
                        <select class="admin-status-select" onchange="updateShareProofStatusAdmin('${row.id || ''}', '${custPhone}', this.value)">
                            <option value="Terverifikasi" ${statusText.includes('Terverifikasi') ? 'selected' : ''}>✓ Valid / Terverifikasi</option>
                            <option value="Sudah Dipakai Checkout" ${statusText.includes('Checkout') ? 'selected' : ''}>🛒 Sudah Dipakai Order</option>
                            <option value="Ditolak (Bukti Tidak Sesuai)" ${isRejected ? 'selected' : ''}>✕ Tolak & Reset Klaim</option>
                        </select>
                    </td>
                </tr>
            `;
        }).join('');
    };

    const htmlResult = renderRowsHtml(cachedAdminShareProofs);
    if (tbodyPanel) tbodyPanel.innerHTML = htmlResult;
    if (tbodyUrl) tbodyUrl.innerHTML = htmlResult;
}

function showDirectImagePreview(url, name, phone) {
    const titleEl = document.getElementById('lightboxShareTitle');
    const metaEl = document.getElementById('lightboxShareMeta');
    const imgEl = document.getElementById('lightboxShareImg');
    const dlBtn = document.getElementById('lightboxDownloadBtn');

    if (titleEl) titleEl.innerText = `${name || 'Customer'} (${phone || '-'})`;
    if (metaEl) metaEl.innerText = `Bukti Share Promo`;
    if (imgEl) imgEl.src = url;
    if (dlBtn) {
        dlBtn.href = url;
        dlBtn.download = `bukti-share-${(phone || 'cust').replace(/[^0-9]/g, '')}.jpg`;
    }
    openModal('shareProofLightboxModal');
}

function openShareProofLightbox(index) {
    const item = cachedAdminShareProofs[index];
    if (!item || !item.proof_image_url) {
        showToast('Tidak ada file gambar bukti share pada baris ini.');
        return;
    }
    showDirectImagePreview(item.proof_image_url, item.customer_name, item.customer_phone);
}

async function updateShareProofStatusAdmin(rowId, customerPhone, newStatus) {
    const cleanPh = String(customerPhone || '').replace(/[^0-9]/g, '');
    if (newStatus.toLowerCase().includes('tolak')) {
        if (cleanPh) localStorage.removeItem(`ngopa_share_paket_used_${cleanPh}`);
    } else if (newStatus.toLowerCase().includes('checkout')) {
        if (cleanPh) localStorage.setItem(`ngopa_share_paket_used_${cleanPh}`, 'true');
    }

    // Update di localStorage history jika ada
    try {
        const localList = JSON.parse(localStorage.getItem('ngopa_share_proofs_history') || '[]');
        const updatedLocal = localList.map(r => {
            if ((rowId && String(r.id) === String(rowId)) || r.customer_phone === customerPhone) {
                return { ...r, claim_status: newStatus };
            }
            return r;
        });
        localStorage.setItem('ngopa_share_proofs_history', JSON.stringify(updatedLocal));
    } catch (e) {}

    // Update di Supabase jika memiliki ID numerik database
    if (rowId && !String(rowId).startsWith('local-') && !String(rowId).startsWith('reg-')) {
        try {
            await supabaseClient
                .from('paket_hemat_shares')
                .update({ claim_status: newStatus })
                .eq('id', rowId);
        } catch (e) {
            console.warn('Gagal update status klaim share di Supabase:', e);
        }
    }

    showToast(`Status bukti share diperbarui menjadi: ${newStatus}`);
    await loadAdminShareProofs();
}

function handleCartShareToggleBtn() {
    const bundleItemInCart = cart.find(c => c.category === 'Paket Hemat' && isBundlingDrinkAndFood(c));
    openSharePaketHematModal(bundleItemInCart || { id: 'bundle', name: 'Bundling Drink & Food', category: 'Paket Hemat' });
}

function checkReferralRegistrationRedirect() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('ref')) {
        localStorage.setItem('ngopa_referred_by', params.get('ref'));
    }
    if (params.get('register') === '1' || params.get('ref')) {
        setTimeout(() => {
            closeDailyAnnouncement();
            openAccountModal('register');
            showToast('👋 Selamat datang! Silakan daftarkan akunmu untuk klaim promo & poin harian.');
        }, 500);
    }
}