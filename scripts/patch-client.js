const fs = require('fs');
const path = 'frontend/client/index.html';
let h = fs.readFileSync(path, 'utf8');
const D = 'div';

const navStart = h.indexOf(`    <${D} class="navbar">`);
const navEnd = h.indexOf(`    <${D} class="catalog-section"`, navStart);
if (navStart === -1 || navEnd === -1) {
  console.error('nav markers', navStart, navEnd);
  process.exit(1);
}

const newNav = `    <${D} class="navbar">
        <${D} class="logo-brand-row">
            <${D} class="logo">Zerno <span>Кофейня</span></${D}>
            <${D} class="search-container">
                <span class="material-symbols-rounded search-icon icon-sm">search</span>
                <input type="text" class="search-input" id="searchInput" placeholder="Поиск блюда..." oninput="handleSearch()" onfocus="showSearchResults()" onblur="hideSearchResultsDelayed()">
                <${D} class="search-results" id="searchResults"></${D}>
                <${D} class="search-panel" id="searchFilters">
                    <${D} class="filter-bar" style="margin:0;padding:0;border:none;background:transparent;">
                        <select id="searchCategory" onchange="handleSearch()"><option value="">Все категории</option></select>
                        <select id="searchSort" onchange="handleSearch()">
                            <option value="">Без сортировки</option>
                            <option value="price_asc">Цена ↑</option>
                            <option value="price_desc">Цена ↓</option>
                            <option value="popularity">Популярность</option>
                        </select>
                    </${D}>
                </${D}>
            </${D}>
        </${D}>
        <${D} class="nav-links">
            <a onclick="scrollToCatalog()">Меню</a>
            <a onclick="scrollToHowTo()">Как заказать</a>
            <a onclick="scrollToLocations()">Кофейни</a>
            <${D} class="icon-btn cart-icon" onclick="toggleCart()" title="Корзина" style="position:relative;">
                <span class="material-symbols-rounded">shopping_cart</span>
                <span class="cart-count" id="cartCount">0</span>
            </${D}>
            <${D} id="authButtons">
                <button class="btn-outline" onclick="showLoginModal()">Вход</button>
                <button class="btn-primary" onclick="showRegisterModal()">Регистрация</button>
            </${D}>
            <${D} class="profile-section" id="profileSection" style="display:none;">
                <${D} class="avatar" id="avatar" onclick="toggleProfileDropdown()"><span class="material-symbols-rounded">person</span></${D}>
                <${D} class="profile-dropdown" id="profileDropdown">
                    <${D} class="profile-header">
                        <${D} class="profile-avatar" id="profileAvatar"><span class="material-symbols-rounded" style="font-size:32px;">person</span></${D}>
                        <h4 id="profileName"></h4>
                        <p id="profileEmail"></p>
                    </${D}>
                    <${D} style="padding:15px;">
                        <button class="btn-primary btn-full" onclick="location.href='profile.html'">Перейти в профиль</button>
                    </${D}>
                    <button class="logout-btn-dropdown" onclick="logout()">Выйти</button>
                </${D}>
            </${D}>
        </${D}>
    </${D}>

    <${D} class="cart-toast" id="cartToast">
        <span class="material-symbols-rounded">check_circle</span>
        <span>Товар добавлен в корзину</span>
    </${D}>

`;

h = h.slice(0, navStart) + newNav + h.slice(navEnd);

// Modal close
h = h.replace(
  `<${D} id="registerModal" class="modal">\n        <${D} class="modal-content">`,
  `<${D} id="registerModal" class="modal">\n        <${D} class="modal-content" style="position:relative;">\n            <button class="modal-close" onclick="closeModal('registerModal')"><span class="material-symbols-rounded">close</span></button>`
);
h = h.replace(
  `<${D} id="loginModal" class="modal">\n        <${D} class="modal-content">`,
  `<${D} id="loginModal" class="modal">\n        <${D} class="modal-content" style="position:relative;">\n            <button class="modal-close" onclick="closeModal('loginModal')"><span class="material-symbols-rounded">close</span></button>`
);

// Category filters
h = h.replace(
  '<h2 class="section-title" id="categoryTitle"></h2>\n            <${D} class="menu-grid" id="productsGrid">'.replace('${D}', D),
  `<h2 class="section-title" id="categoryTitle"></h2>
            <${D} class="filter-bar" id="categoryFilters">
                <select id="catSort" onchange="applyCategoryFilters()">
                    <option value="">Без сортировки</option>
                    <option value="price_asc">Цена ↑</option>
                    <option value="price_desc">Цена ↓</option>
                    <option value="popularity">Популярность</option>
                </select>
            </${D}>
            <${D} class="menu-grid" id="productsGrid">`
);

h = h.replace('<h3>🛒 Ваш заказ</h3>', '<h3><span class="material-symbols-rounded">shopping_cart</span> Ваш заказ</h3>');

// JS: cart toast, max 5, checkout redirect, localStorage
if (!h.includes('showCartToast')) {
  h = h.replace(
    'function addToCart(item) {',
    `function showCartToast() {
            const t = document.getElementById('cartToast');
            if (t) { t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2500); }
        }
        function saveCart() { localStorage.setItem('zerno_cart', JSON.stringify(cart)); }
        function loadCartStorage() { try { const c = JSON.parse(localStorage.getItem('zerno_cart')||'[]'); if(c.length) cart=c; } catch(e){} }
        function addToCartById(id) {
            const item = allItems.find(i => i.id === id) || cart.find(i => i.id === id);
            if (item) addToCart(item);
        }
        function addToCart(item) {`
  );
}

h = h.replace(
  'if (existing) existing.quantity++;\n            else cart.push({ ...item, quantity: 1 });\n            updateCart();',
  `if (existing) {
                if (existing.quantity >= 5) { alert('Максимум 5 позиций одного товара'); return; }
                existing.quantity++;
            } else cart.push({ ...item, quantity: 1 });
            updateCart(); saveCart(); showCartToast();`
);

h = h.replace(
  "document.getElementById('checkoutModal').style.display = 'flex';",
  "saveCart(); window.location.href = 'checkout.html';"
);

h = h.replace(
  "let token = sessionStorage.getItem('token');",
  "loadCartStorage(); updateCart(); let token = localStorage.getItem('token');"
);

h = h.replace(
  'else sessionStorage.removeItem(\'token\');',
  'else localStorage.removeItem(\'token\');'
);

h = h.replace(
  "} catch(e) { sessionStorage.removeItem('token'); }",
  "} catch(e) { localStorage.removeItem('token'); }"
);

// Search filters helper
if (!h.includes('applyItemFilters')) {
  h = h.replace(
    '        // ====== ПОИСК ======\n        function handleSearch() {',
    `        let currentCategoryProducts = [];
        function applyItemFilters(items, sortVal) {
            let list = [...items];
            const cat = document.getElementById('searchCategory')?.value;
            if (cat) list = list.filter(i => String(i.category_id) === String(cat));
            if (sortVal === 'price_asc') list.sort((a,b) => a.price - b.price);
            else if (sortVal === 'price_desc') list.sort((a,b) => b.price - a.price);
            else if (sortVal === 'popularity') list.sort((a,b) => (b.popularity||0) - (a.popularity||0));
            return list;
        }
        function applyCategoryFilters() {
            const sort = document.getElementById('catSort')?.value || '';
            let products = applyItemFilters(currentCategoryProducts, sort);
            const container = document.getElementById('productsGrid');
            if (!products.length) { container.innerHTML = '<p>Нет позиций</p>'; return; }
            container.innerHTML = products.map(item => buildProductCard(item)).join('');
        }
        function buildProductCard(item) {
            const img = item.image_url
                ? '<img src="'+item.image_url+'" onerror="this.parentElement.innerHTML=\\'<span class=material-symbols-rounded>coffee</span>\\'">'
                : '<span class="material-symbols-rounded" style="font-size:48px;color:#8a6a5a">coffee</span>';
            return '<${D} class="coffee-card" style="cursor:pointer" onclick="openProduct('+item.id+')"><${D} class="card-image">'+img+'</${D}><${D} class="card-info"><${D} class="card-title">'+item.name+'</${D}><${D} class="nutrition">'+(item.calories||0)+' ккал</${D}><${D} class="card-footer"><${D} class="price">'+item.price.toFixed(2)+' BYN</${D}><button class="add-btn" onclick="event.stopPropagation();addToCartById('+item.id+')">+</button></${D}></${D}></${D}>'.replace(/\$\{D\}/g, D);
        }
        function openProduct(id) { const item = allItems.find(i => i.id === id); if (item) showProductDetails(item); }

        // ====== ПОИСК ======
        function handleSearch() {`.replace(/\$\{D\}/g, D)
  );
}

h = h.replace(
  `const filtered = allItems.filter(item => 
                item.name.toLowerCase().includes(query) || 
                (item.description && item.description.toLowerCase().includes(query))
            );`,
  `let filtered = allItems.filter(item => 
                item.name.toLowerCase().includes(query) || 
                (item.description && item.description.toLowerCase().includes(query))
            );
            filtered = applyItemFilters(filtered, document.getElementById('searchSort')?.value || '');`
);

h = h.replace(
  `function showSearchResults() {
            if (document.getElementById('searchInput').value.length >= 2) {
                handleSearch();
            }
        }`,
  `function showSearchResults() {
            document.getElementById('searchFilters')?.classList.add('show');
            if (document.getElementById('searchInput').value.length >= 2) handleSearch();
        }`
);

h = h.replace(
  `document.getElementById('searchResults').classList.remove('show');
            }, 200);`,
  `document.getElementById('searchResults').classList.remove('show');
                document.getElementById('searchFilters')?.classList.remove('show');
            }, 200);`
);

// showCategoryProducts simplified
const oldCatFn = h.indexOf('function showCategoryProducts(categoryId, categoryName) {');
if (oldCatFn > 0) {
  const endFn = h.indexOf('        // ====== ПОИСК ======', oldCatFn);
  if (endFn > oldCatFn) {
    h = h.slice(0, oldCatFn) + `function showCategoryProducts(categoryId, categoryName) {
            currentCategoryProducts = allItems.filter(item => item.category_id == categoryId);
            document.getElementById('catalog').style.display = 'none';
            document.getElementById('productsSection').classList.add('active');
            document.getElementById('categoryTitle').innerText = categoryName;
            applyCategoryFilters();
        }

        ` + h.slice(endFn);
  }
}

// loadCategories - populate search select
h = h.replace(
  'categories = await res.json();\n            document.getElementById(\'categoriesGrid\').innerHTML',
  `categories = await res.json();
            const sc = document.getElementById('searchCategory');
            if (sc) sc.innerHTML = '<option value="">Все категории</option>' + categories.map(c => '<option value="'+c.id+'">'+c.name+'</option>').join('');
            document.getElementById('categoriesGrid').innerHTML`
);

// Cart with images
h = h.replace(
  /container\.innerHTML = cart\.map\(i => `[\s\S]*?`\)\.join\(''\);/,
  `container.innerHTML = cart.map(i => {
                const thumb = i.image_url
                    ? '<img class="cart-item-thumb" src="'+i.image_url+'" onerror="this.style.display=\\'none\\'">'
                    : '<${D} class="cart-item-thumb" style="display:flex;align-items:center;justify-content:center;"><span class="material-symbols-rounded">coffee</span></${D}>'.replace(/\$\{D\}/g, D);
                return '<${D} class="cart-item-row">'+thumb+'<${D} style="flex:1"><strong>'+i.name+'</strong><br>'+i.price.toFixed(2)+' BYN × '+i.quantity+'<${D} style="margin-top:8px"><button class="cart-qty-btn" onclick="removeFromCart('+i.id+')">−</button> <span>'+i.quantity+'</span> <button class="cart-qty-btn" onclick="addToCartById('+i.id+')">+</button></${D}></${D}></${D}>'.replace(/\$\{D\}/g, D);
            }).join('');`
);

fs.writeFileSync(path, h);
console.log('OK');
