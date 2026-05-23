const API = '/api';
        let currentUser = null;
        let allItems = [];
        let categories = [];
        let cart = [];
        let allOrders = [];
        let orderStatusMap = {};
        let orderPollTimer = null;
        let catalogBrowseCategoryId = null;
        async function pollClientOrders() {
            const token = getAuthToken();
            if (!token || !currentUser) return;
            try {
                const res = await fetch(API + '/my-orders/detailed', {
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                if (!res.ok) return;
                const orders = await res.json();
                if (!Array.isArray(orders)) return;
                orderStatusMap = trackOrderStatusChanges(orders, orderStatusMap);
                allOrders = orders;
            } catch (e) { /* ignore */ }
        }

        function startClientOrderPolling() {
            if (orderPollTimer) return;
            pollClientOrders();
            orderPollTimer = setInterval(pollClientOrders, 20000);
        }

        // Основные функции
        function toggleCart() { 
            document.getElementById('cart').classList.toggle('open'); 
            document.getElementById('overlay').classList.toggle('show'); 
        }
        
        function showLoginModal() { 
            closeModal('registerModal');
            document.getElementById('loginModal').style.display = 'flex'; 
        }
        
        function showRegisterModal() { 
            closeModal('loginModal');
            closeModal('forgotModal');
            resetRegisterForm();
            setupPhoneInput('regPhone');
            document.getElementById('registerModal').style.display = 'flex'; 
        }

        function resetRegisterForm() {
            setRegisterStep(1);
            ['regName', 'regEmail', 'regCode', 'regPass', 'regPass2'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
        }

        function setRegisterStep(n) {
            [1, 2, 3].forEach(i => {
                const panel = document.getElementById('regStep' + i);
                if (panel) panel.style.display = i === n ? 'block' : 'none';
                document.querySelectorAll('.auth-step-dot[data-step="' + i + '"]').forEach(d => {
                    d.classList.toggle('active', i <= n);
                });
            });
            const subtitles = {
                1: 'Шаг 1 из 3 — ваши данные',
                2: 'Шаг 2 из 3 — код из письма',
                3: 'Шаг 3 из 3 — пароль'
            };
            const sub = document.getElementById('regStepSubtitle');
            if (sub) sub.innerText = subtitles[n] || '';
        }

        function showForgotPasswordModal() {
            closeModal('loginModal');
            document.getElementById('forgotStep1').style.display = 'block';
            document.getElementById('forgotStep2').style.display = 'none';
            document.getElementById('forgotEmail').value = document.getElementById('loginEmail')?.value || '';
            document.getElementById('forgotModal').style.display = 'flex';
        }

        async function parseApiError(res) {
            try {
                const d = await res.json();
                return d.error || 'Ошибка';
            } catch (_) {
                return 'Ошибка';
            }
        }

        function handleMailSent(data, codeInputId) {
            if (data && data.devCode && codeInputId) {
                const el = document.getElementById(codeInputId);
                if (el) el.value = data.devCode;
                return 'Код подставлен (почта на сервере не настроена)';
            }
            if (data && data.mailSent) {
                return data.message || 'Код отправлен на email';
            }
            return data?.message || 'Готово';
        }

        function setAuthLoading(btn, loading) {
            if (!btn) return;
            btn.disabled = loading;
            btn.dataset.loading = loading ? '1' : '';
            if (loading) btn.dataset.prevText = btn.innerText, btn.innerText = 'Отправка…';
            else if (btn.dataset.prevText) btn.innerText = btn.dataset.prevText;
        }
        
        function closeModal(id) {
            document.getElementById(id).style.display = 'none';
            if (id === 'bookingModal') document.body.style.overflow = '';
            clearErrors();
        }
        
        function switchToLogin() {
            closeModal('registerModal');
            showLoginModal();
        }
        
        function switchToRegister() {
            closeModal('loginModal');
            showRegisterModal();
        }
        
        function scrollToCatalog() { document.getElementById('catalog').scrollIntoView({ behavior: 'smooth' }); }
        function scrollToHowTo() { document.getElementById('howToOrder').scrollIntoView({ behavior: 'smooth' }); }
        function scrollToLocations() { document.getElementById('locations').scrollIntoView({ behavior: 'smooth' }); }
        function toggleProfileDropdown() { document.getElementById('profileDropdown').classList.toggle('show'); }

        function getCategoryIcon(name) {
            const map = {
                'Кофе': 'coffee', 'Десерты': 'cake', 'Напитки': 'local_cafe',
                'Выпечка': 'bakery_dining', 'Хлеб': 'bread_slice', 'Торты': 'cake',
                'Круассаны': 'breakfast_dining', 'Горячие напитки': 'coffee', 'Сэндвичи': 'lunch_dining'
            };
            const icon = map[name] || 'restaurant';
            return '<span class="material-symbols-rounded" style="font-size:36px;color:#8a6a5a">' + icon + '</span>';
        }

        function showCatalog() {
            const catalog = document.getElementById('catalog');
            if (catalog) catalog.style.display = 'block';
            scrollToCatalog();
        }

        function clampPriceInput(el) {
            if (!el || el.value === '') return;
            const n = parseFloat(el.value);
            if (isNaN(n) || n < 0) el.value = '0';
        }

        function parsePriceField(id) {
            const el = document.getElementById(id);
            if (!el || el.value === '') return null;
            const n = parseFloat(el.value);
            if (isNaN(n) || n < 0) return 0;
            return n;
        }

        function filterAndSortItems(items, opts) {
            let list = [...items];
            if (opts.category) list = list.filter(i => String(i.category_id) === String(opts.category));
            if (opts.priceMin != null) list = list.filter(i => i.price >= opts.priceMin);
            if (opts.priceMax != null) list = list.filter(i => i.price <= opts.priceMax);
            const sort = opts.sort || '';
            if (sort === 'price_asc') list.sort((a, b) => a.price - b.price);
            else if (sort === 'price_desc') list.sort((a, b) => b.price - a.price);
            else if (sort === 'popularity_asc') list.sort((a, b) => (a.popularity || 0) - (b.popularity || 0));
            else if (sort === 'popularity_desc') list.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
            else if (sort === 'popularity') list.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
            return list;
        }

        function readSearchFilterOpts() {
            return {
                category: document.getElementById('searchCategory')?.value || '',
                priceMin: parsePriceField('searchPriceMin'),
                priceMax: parsePriceField('searchPriceMax'),
                sort: document.getElementById('searchSort')?.value || ''
            };
        }

        function readCatalogFilterOpts() {
            const filterCategory = document.getElementById('catalogFilterCategory')?.value || '';
            const category = catalogBrowseCategoryId || filterCategory;
            return {
                category,
                priceMin: parsePriceField('catalogPriceMin'),
                priceMax: parsePriceField('catalogPriceMax'),
                sort: document.getElementById('catalogSort')?.value || ''
            };
        }

        function onCatalogFilterCategoryChange() {
            catalogBrowseCategoryId = null;
            applyCatalogFilters();
        }

        function populateCategorySelects() {
            const opts = '<option value="">Все категории</option>' +
                categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
            ['searchCategory', 'catalogFilterCategory'].forEach(id => {
                const sel = document.getElementById(id);
                if (sel) {
                    const cur = sel.value;
                    sel.innerHTML = opts;
                    if (cur) sel.value = cur;
                }
            });
        }

        function resetCatalogFilters() {
            catalogBrowseCategoryId = null;
            ['catalogFilterCategory', 'catalogSort'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            ['catalogPriceMin', 'catalogPriceMax'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            applyCatalogFilters();
        }

        function applyCatalogFilters() {
            const opts = readCatalogFilterOpts();
            const categoriesView = document.getElementById('catalogCategoriesView');
            const productsView = document.getElementById('catalogProductsView');
            const container = document.getElementById('catalogMenuGrid');
            const titleEl = document.getElementById('catalogResultsTitle');
            const backBtn = document.getElementById('catalogBackBtn');

            if (!opts.category) {
                catalogBrowseCategoryId = null;
                if (categoriesView) categoriesView.hidden = false;
                if (productsView) productsView.hidden = true;
                if (container) container.innerHTML = '';
                if (backBtn) backBtn.hidden = true;
                return;
            }

            if (categoriesView) categoriesView.hidden = true;
            if (productsView) productsView.hidden = false;
            if (backBtn) backBtn.hidden = false;

            const cat = categories.find(c => String(c.id) === String(opts.category));
            if (titleEl) titleEl.innerText = cat ? cat.name : 'Позиции';

            const base = allItems.filter(i => String(i.category_id) === String(opts.category));
            const products = filterAndSortItems(base, { ...opts, category: '' });

            if (!container) return;
            if (!products.length) {
                container.innerHTML = '<p class="catalog-empty">В этой категории ничего не найдено. Попробуйте изменить фильтры.</p>';
                return;
            }
            container.innerHTML = products.map(item => buildProductCard(item)).join('');
        }

        function showCatalogCategories() {
            catalogBrowseCategoryId = null;
            const sel = document.getElementById('catalogFilterCategory');
            if (sel) sel.value = '';
            applyCatalogFilters();
            document.getElementById('catalogCategoriesView')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        function renderPopularProducts() {
            const wrap = document.getElementById('popularScroll');
            if (!wrap || !allItems.length) return;
            const popular = [...allItems]
                .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
                .slice(0, 12);
            wrap.innerHTML = popular.map(item => {
                const img = item.image_url
                    ? `<img src="${item.image_url}" alt="${item.name}">`
                    : '<span class="material-symbols-rounded">coffee</span>';
                return `<article class="popular-card" onclick="openProduct(${item.id})">
                    <div class="popular-card-image">${img}</div>
                    <div class="popular-card-body">
                        <h4>${item.name}</h4>
                        <span class="popular-card-price">${item.price.toFixed(2)} BYN</span>
                    </div>
                </article>`;
            }).join('');
        }

        function toggleSearchFilters(e) {
            if (e) e.stopPropagation();
            const panel = document.getElementById('searchFiltersPanel');
            const btn = document.getElementById('searchFilterBtn');
            if (!panel) return;
            const open = panel.classList.toggle('show');
            if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        }

        function buildProductCard(item) {
            const img = item.image_url
                ? `<img src="${item.image_url}" onerror="this.parentElement.innerHTML='<span class=material-symbols-rounded>coffee</span>'">`
                : '<span class="material-symbols-rounded" style="font-size:48px;color:#8a6a5a">coffee</span>';
            return `<div class="coffee-card" style="cursor:pointer" onclick="openProduct(${item.id})">
                <div class="card-image">${img}</div>
                <div class="card-info">
                    <div class="card-title">${item.name}</div>
                    <div class="nutrition">${item.calories || 0} ккал</div>
                    <div class="card-footer">
                        <div class="price">${item.price.toFixed(2)} BYN</div>
                        <button class="add-btn" onclick="event.stopPropagation();addToCartById(${item.id})">+</button>
                    </div>
                </div>
            </div>`;
        }

        function openProduct(id) {
            const item = allItems.find(i => i.id === id);
            if (item) showProductDetails(item);
        }

        function showCategoryProducts(categoryId) {
            catalogBrowseCategoryId = String(categoryId);
            applyCatalogFilters();
            document.getElementById('catalogProductsView')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

                // ====== ПОИСК ======
        function handleSearch() {
            const query = document.getElementById('searchInput').value.toLowerCase().trim();
            const resultsContainer = document.getElementById('searchResults');
            
            if (query.length < 2) {
                resultsContainer.classList.remove('show');
                return;
            }
            
            let filtered = allItems.filter(item => 
                item.name.toLowerCase().includes(query) || 
                (item.description && item.description.toLowerCase().includes(query))
            );
            filtered = filterAndSortItems(filtered, readSearchFilterOpts());
            
            if (filtered.length === 0) {
                resultsContainer.innerHTML = '<div class="search-result-item"><span>Ничего не найдено</span></div>';
            } else {
                resultsContainer.innerHTML = filtered.slice(0, 8).map(item => `
                    <div class="search-result-item" onclick="selectSearchResult(${item.category_id}, '${categories.find(c => c.id == item.category_id)?.name || ''}', ${JSON.stringify(item).replace(/"/g, '&quot;')})">
                        <span>${item.name}</span>
                        <span style="color: #8a6a5a; font-size: 12px;">${item.price.toFixed(2)} BYN</span>
                    </div>
                `).join('');
            }
            
            resultsContainer.classList.add('show');
        }
        
        function showSearchResults() {
            if (document.getElementById('searchInput').value.length >= 2) {
                handleSearch();
            }
        }
        
        function hideSearchResultsDelayed() {
            setTimeout(() => {
                document.getElementById('searchResults').classList.remove('show');
            }, 200);
        }
        
        function selectSearchResult(categoryId, categoryName, item) {
            openProduct(item.id);
            document.getElementById('searchResults').classList.remove('show');
            document.getElementById('searchInput').value = '';
            const panel = document.getElementById('searchFiltersPanel');
            if (panel) panel.classList.remove('show');
        }

        // ====== ВАЛИДАЦИЯ ======
        function validateEmail(fieldId) {
            const email = document.getElementById(fieldId).value;
            const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            const errorEl = document.getElementById(fieldId + 'Error');
            const inputEl = document.getElementById(fieldId);
            
            if (email && !regex.test(email)) {
                inputEl.classList.add('error');
                if (errorEl) errorEl.classList.add('show');
                return false;
            } else {
                inputEl.classList.remove('error');
                if (errorEl) errorEl.classList.remove('show');
                return true;
            }
        }
        
        function checkPasswordStrength(fieldId) {
            const pass = document.getElementById(fieldId).value;
            const hint = document.getElementById('passHint');
            
            const hasUpper = /[A-Z]/.test(pass);
            const hasNumber = /[0-9]/.test(pass);
            const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(pass);
            const isLongEnough = pass.length >= 7;
            
            if (pass.length === 0) {
                hint.className = 'password-hint';
                hint.innerText = 'Минимум 7 символов, заглавная буква, цифра и спецсимвол';
                return;
            }
            
            if (isLongEnough && hasUpper && hasNumber && hasSpecial) {
                hint.className = 'password-hint valid';
                hint.innerText = '✓ Отличный пароль!';
            } else {
                hint.className = 'password-hint invalid';
                let issues = [];
                if (!isLongEnough) issues.push('мин. 7 символов');
                if (!hasUpper) issues.push('заглавная буква');
                if (!hasNumber) issues.push('цифра');
                if (!hasSpecial) issues.push('спецсимвол');
                hint.innerText = 'Требуется: ' + issues.join(', ');
            }
        }
        
        function validatePassword(pass) {
            const hasUpper = /[A-Z]/.test(pass);
            const hasNumber = /[0-9]/.test(pass);
            const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(pass);
            return pass.length >= 7 && hasUpper && hasNumber && hasSpecial;
        }
        
        function togglePassword(fieldId, btn) {
            const input = document.getElementById(fieldId);
            if (input.type === 'password') {
                input.type = 'text';
                btn.innerText = 'Скрыть';
            } else {
                input.type = 'password';
                btn.innerText = 'Показать';
            }
        }
        
        function clearErrors() {
            document.querySelectorAll('.error').forEach(el => el.classList.remove('error'));
            document.querySelectorAll('.error-message').forEach(el => el.classList.remove('show'));
        }
        
        function showSuccess(message) {
            if (typeof appNotify === 'function') {
                appNotify(message, 'success');
                return;
            }
            const toast = document.getElementById('successToast');
            if (toast) {
                toast.innerText = message;
                toast.classList.add('show');
                setTimeout(() => toast.classList.remove('show'), 3000);
            }
        }

        function notifyError(message) {
            if (typeof appNotify === 'function') appNotify(message, 'error');
        }

        // Корзина
        function showCartToast() {
            const t = document.getElementById('cartToast');
            if (t) { t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2500); }
        }
        function saveCart() { localStorage.setItem('zerno_cart', JSON.stringify(cart)); }
        function loadCartStorage() { try { const c = JSON.parse(localStorage.getItem('zerno_cart')||'[]'); if(c.length) cart=c; } catch(e){} }
        function addToCartById(id) {
            const item = allItems.find(i => i.id === id) || cart.find(i => i.id === id);
            if (item) addToCart(item);
        }
        function addToCart(item) {
            if (!currentUser) {
                showLoginModal();
                return;
            }
            let existing = cart.find(i => i.id === item.id);
            if (existing) {
                if (existing.quantity >= 5) return;
                existing.quantity++;
            } else {
                cart.push({ ...item, quantity: 1 });
            }
            updateCart();
            saveCart();
            showCartToast();
        }

        function removeFromCart(id) {
            let idx = cart.findIndex(i => i.id === id);
            if (idx > -1) { 
                if (cart[idx].quantity > 1) cart[idx].quantity--; 
                else cart.splice(idx, 1); 
            }
            updateCart();
            if (currentUser) saveCart();
        }

        function updateCart() {
            let count = cart.reduce((s, i) => s + i.quantity, 0);
            document.getElementById('cartCount').innerText = count;
            document.getElementById('cartItemsCount').innerText = count;
            
            let container = document.getElementById('cartItems');
            if (cart.length === 0) { 
                container.innerHTML = `
                    <div class="cart-empty">
                        <div class="cart-empty-icon"><span class="material-symbols-rounded" style="font-size:48px;opacity:0.4">shopping_cart</span></div>
                        <p>Ваша корзина пуста</p>
                        <p style="font-size: 13px; margin-top: 8px;">Добавьте что-нибудь вкусное!</p>
                    </div>
                `; 
                document.getElementById('cartTotal').innerText = '0 BYN'; 
                return; 
            }
            
            container.innerHTML = cart.map(i => {
                const thumb = i.image_url
                    ? '<img class="cart-item-thumb" src="'+i.image_url+'" onerror="this.style.display=\'none\'">'
                    : '<div class="cart-item-thumb" style="display:flex;align-items:center;justify-content:center;"><span class="material-symbols-rounded">coffee</span></div>';
                return '<div class="cart-item">'+thumb+
                    '<div class="cart-item-info"><div class="cart-item-name">'+i.name+'</div><div class="cart-item-price">'+i.price.toFixed(2)+' BYN</div></div>'+
                    '<div class="cart-item-controls"><button type="button" class="cart-qty-btn" onclick="removeFromCart('+i.id+')">−</button><span class="cart-qty">'+i.quantity+'</span><button type="button" class="cart-qty-btn" onclick="addToCartById('+i.id+')">+</button></div></div>';
            }).join('');
            
            let total = cart.reduce((s, i) => s + i.price * i.quantity, 0);
            document.getElementById('cartTotal').innerText = total.toFixed(2) + ' BYN';
        }

        function openCheckout() {
            if (!currentUser) { showLoginModal(); return; }
            if (cart.length === 0) { notifyError('Корзина пуста'); return; }
            saveCart(); window.location.href = 'checkout.html';
        }

        // Авторизация и профиль
        async function registerSendCode(isResend) {
            const btn = event?.target?.closest?.('button') || document.querySelector('#regStep1 .btn-primary');
            const email = document.getElementById('regEmail').value.trim();
            const phone = getPhoneForSubmit('regPhone');
            const fullname = document.getElementById('regName').value.trim();
            if (!fullname || !phone || !email) return notifyError('Заполните все поля');
            if (!validateEmail('regEmail')) return notifyError('Введите корректный email');
            setAuthLoading(btn, true);
            try {
                const res = await fetch(API + '/auth/register/send-code', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, phone, fullname })
                });
                const data = await res.json().catch(() => ({}));
                if (res.ok) {
                    document.getElementById('regEmailDisplay').innerText = email;
                    document.getElementById('regCode').value = '';
                    setRegisterStep(2);
                    if (data.devCode) document.getElementById('regCode').value = data.devCode;
                    showSuccess(handleMailSent(data, 'regCode'));
                } else notifyError(data.error || 'Ошибка');
            } finally {
                setAuthLoading(btn, false);
            }
        }

        async function registerVerifyCode() {
            const btn = event?.target?.closest?.('button');
            const email = document.getElementById('regEmail').value.trim();
            const code = document.getElementById('regCode').value.trim();
            if (!code || code.length < 6) return notifyError('Введите 6-значный код из письма');
            setAuthLoading(btn, true);
            try {
                const res = await fetch(API + '/auth/register/verify-code', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, code })
                });
                if (res.ok) {
                    setRegisterStep(3);
                    showSuccess('Код подтверждён — придумайте пароль');
                } else notifyError(await parseApiError(res));
            } finally {
                setAuthLoading(btn, false);
            }
        }

        async function registerComplete() {
            const email = document.getElementById('regEmail').value.trim();
            const code = document.getElementById('regCode').value.trim();
            const p1 = document.getElementById('regPass').value;
            const p2 = document.getElementById('regPass2').value;
            if (!validatePassword(p1)) return notifyError('Пароль не соответствует требованиям');
            if (p1 !== p2) {
                document.getElementById('regPass2Error').classList.add('show');
                return notifyError('Пароли не совпадают');
            }
            const res = await fetch(API + '/auth/register/complete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, code, password: p1 })
            });
            const data = await res.json();
            if (res.ok) {
                applyLoggedIn(data);
                closeModal('registerModal');
                showSuccess('Добро пожаловать, ' + (data.user.fullname || 'друг') + '!');
            } else notifyError(data.error || 'Ошибка регистрации');
        }

        async function login() {
            const email = document.getElementById('loginEmail').value.trim();
            const pass = document.getElementById('loginPass').value;
            if (!email || !pass) return notifyError('Введите email и пароль');
            if (!validateEmail('loginEmail')) return notifyError('Введите корректный email');
            const res = await fetch(API + '/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password: pass })
            });
            const data = await res.json();
            if (res.ok) {
                applyLoggedIn(data);
                closeModal('loginModal');
                showSuccess('Добро пожаловать, ' + (data.user.fullname || 'друг') + '!');
            } else notifyError(data.error || 'Вход не выполнен');
        }

        function applyLoggedIn(data) {
            if (!setAuthToken(data.token)) {
                notifyError('Ошибка входа: неверный токен');
                return;
            }
            saveClientSession(data.user, data.token);
            currentUser = { ...data.user, role: data.user?.role || 'client' };
            document.getElementById('authButtons').style.display = 'none';
            document.getElementById('profileSection').style.display = 'block';
            document.getElementById('profileName').innerText = currentUser.fullname || currentUser.email;
            document.getElementById('profileEmail').innerText = currentUser.email;
            updateCart();
            startClientOrderPolling();
            updateBookingAuthUi();
        }

        function showLoggedInUi(user) {
            if (!user) return;
            currentUser = user;
            document.getElementById('authButtons').style.display = 'none';
            document.getElementById('profileSection').style.display = 'block';
            document.getElementById('profileName').innerText = user.fullname || user.email || 'Гость';
            document.getElementById('profileEmail').innerText = user.email || '';
            updateBookingAuthUi();
        }

        async function restoreClientAuth() {
            const token = getAuthToken();
            if (!token) return;

            const cached = loadClientSession();
            if (cached) {
                showLoggedInUi(cached);
                loadCartStorage();
                startClientOrderPolling();
                updateBookingAuthUi();
            }

            const payload = parseJwtPayload(token);
            if (payload?.role === 'admin' || payload?.role === 'employee') {
                clearClientSession();
                currentUser = null;
                document.getElementById('authButtons').style.display = 'flex';
                document.getElementById('profileSection').style.display = 'none';
                return;
            }

            const result = await fetchClientProfile(token);
            if (result.ok && result.user) {
                if (!isClientRole(result.user, token)) {
                    clearClientSession();
                    currentUser = null;
                    document.getElementById('authButtons').style.display = 'flex';
                    document.getElementById('profileSection').style.display = 'none';
                    return;
                }
                currentUser = result.user;
                saveClientSession(result.user, token);
                showLoggedInUi(currentUser);
                loadCartStorage();
                startClientOrderPolling();
                updateBookingAuthUi();
                return;
            }

            if (result.authFailed) {
                clearClientSession();
                currentUser = null;
                document.getElementById('authButtons').style.display = 'flex';
                document.getElementById('profileSection').style.display = 'none';
                return;
            }

            if (!cached) {
                document.getElementById('authButtons').style.display = 'flex';
                document.getElementById('profileSection').style.display = 'none';
            }
        }

        async function forgotSendCode() {
            const btn = event?.target?.closest?.('button');
            const email = document.getElementById('forgotEmail').value.trim();
            if (!email) return notifyError('Введите email');
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return notifyError('Введите корректный email');
            setAuthLoading(btn, true);
            try {
                const res = await fetch(API + '/auth/forgot-password/send-code', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email })
                });
                const data = await res.json().catch(() => ({}));
                if (res.ok) {
                    document.getElementById('forgotEmailDisplay').innerText = email;
                    document.getElementById('forgotStep1').style.display = 'none';
                    document.getElementById('forgotStep2').style.display = 'block';
                    document.getElementById('forgotCode').value = data.devCode || '';
                    showSuccess(handleMailSent(data, 'forgotCode'));
                } else if (data.suggestRegister) {
                    const choice = await showNoAccountChoice(email);
                    if (choice === 'register') {
                        closeModal('forgotModal');
                        document.getElementById('regEmail').value = email;
                        showRegisterModal();
                    }
                } else notifyError(data.error || 'Ошибка');
            } finally {
                setAuthLoading(btn, false);
            }
        }

        async function forgotReset() {
            const email = document.getElementById('forgotEmail').value.trim();
            const code = document.getElementById('forgotCode').value.trim();
            const p1 = document.getElementById('forgotPass').value;
            const p2 = document.getElementById('forgotPass2').value;
            if (!validatePassword(p1)) return notifyError('Пароль не соответствует требованиям');
            if (p1 !== p2) return notifyError('Пароли не совпадают');
            const res = await fetch(API + '/auth/forgot-password/reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, code, password: p1 })
            });
            const data = await res.json();
            if (res.ok) {
                showSuccess('Пароль обновлён');
                closeModal('forgotModal');
                document.getElementById('loginEmail').value = email;
                document.getElementById('loginPass').value = '';
                showLoginModal();
            } else notifyError(data.error || 'Ошибка');
        }

        function showEditProfileModal() {
            if (!currentUser) {
                notifyError('Войдите в аккаунт');
                return;
            }
            document.getElementById('editFullname').value = currentUser.fullname || '';
            document.getElementById('editEmail').value = currentUser.email || '';
            document.getElementById('editPhone').value = currentUser.phone || '';
            setupPhoneInput('editPhone');
            document.getElementById('editProfileModal').style.display = 'flex';
        }

        async function updateProfile() {
            const token = getAuthToken();
            if (!token || !currentUser) {
                notifyError('Войдите в аккаунт');
                return;
            }
            const body = {
                fullname: document.getElementById('editFullname').value,
                email: document.getElementById('editEmail').value,
                phone: getPhoneForSubmit('editPhone')
            };
            const res = await fetch(API + '/user/profile', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
                body: JSON.stringify(body)
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                currentUser = data.id ? data : { ...currentUser, ...body };
                saveClientSession(currentUser, token);
                document.getElementById('profileName').innerText = currentUser.fullname || currentUser.email;
                document.getElementById('profileEmail').innerText = currentUser.email || '';
                showSuccess('Профиль обновлён');
                closeModal('editProfileModal');
            } else {
                notifyError(data.error || 'Ошибка сохранения');
            }
        }

        function logout() {
            clearClientSession();
            currentUser = null;
            cart = [];
            if (orderPollTimer) {
                clearInterval(orderPollTimer);
                orderPollTimer = null;
            }
            updateCart();
            document.getElementById('authButtons').style.display = 'flex';
            document.getElementById('profileSection').style.display = 'none';
            updateBookingAuthUi();
            showSuccess('Вы вышли из системы');
        }

        async function loadCategories() {
            let res = await fetch(API + '/categories');
            categories = await res.json();
            document.getElementById('categoriesGrid').innerHTML = categories.map(cat => `
                <div class="category-card" onclick="showCategoryProducts(${cat.id})">
                    <div class="category-image">${cat.image_url ? `<img src="${cat.image_url}">` : `<div style="font-size:36px;">${getCategoryIcon(cat.name)}</div>`}</div>
                    <h3>${cat.name}</h3>
                    <p>${allItems.filter(i => i.category_id == cat.id).length} позиций</p>
                </div>
            `).join('');
        }

        async function loadAllItems() { 
            let res = await fetch(API + '/menu'); 
            allItems = await res.json(); 
        }

        const locations = [
            { name: 'Zerno в ТЦ «Замок»', address: 'г. Минск, ул. Победителей 65', hours: '8:00–22:00', phone: '+375 (44) 444-44-44' }
        ];
        document.getElementById('locationsGrid').innerHTML = locations.map(l =>
            '<' + 'div class="location-info-block">' +
            '<h3 class="location-name">' + l.name + '</h3>' +
            '<p class="location-address">' + l.address + '</p>' +
            '<p class="location-detail"><span class="material-symbols-rounded icon-sm">schedule</span> ' + l.hours + '</p>' +
            '<p class="location-detail"><span class="material-symbols-rounded icon-sm">call</span> ' + l.phone + '</p>' +
            '</' + 'div>'
        ).join('');

        window.onload = async () => {
            setupPhoneInput('regPhone');
            await restoreClientAuth();
            if (!currentUser) {
                cart = [];
                document.getElementById('authButtons').style.display = 'flex';
                document.getElementById('profileSection').style.display = 'none';
            }
            updateCart();
            await loadAllItems();
            await loadCategories();
            populateCategorySelects();
            renderPopularProducts();
            applyCatalogFilters();
            setupBookingModal();
            if (window.location.hash === '#booking') {
                history.replaceState(null, '', window.location.pathname + window.location.search);
                openBookingModal();
            }
        };

        // Бронирование — frontend/shared/client-booking.js


        // ============ МОДАЛЬНОЕ ОКНО ТОВАРА ============
        function showProductDetails(item) {
            const modal = document.getElementById('productModal');
            if (!modal) return;
            const title = document.getElementById('productModalTitle');
            const content = document.getElementById('productModalContent');
            const media = document.getElementById('productModalMedia');
            if (!title || !content) return;
            title.innerText = item.name;
            if (media) {
                media.innerHTML = item.image_url
                    ? '<img src="' + item.image_url + '" alt="' + item.name + '">'
                    : '<div class="product-modal-placeholder"><span class="material-symbols-rounded">coffee</span></div>';
            }
            content.innerHTML =
                '<p class="product-modal-price">' + item.price.toFixed(2) + ' BYN</p>' +
                (item.description ? '<p class="product-modal-desc">' + item.description + '</p>' : '') +
                (item.composition ? '<' + 'div class="product-modal-box"><strong>Состав</strong><p>' + item.composition + '</p></' + 'div>' : '') +
                '<' + 'div class="product-modal-box"><strong>КБЖУ</strong><p>' +
                (item.calories || 0) + ' ккал · Б ' + (item.protein || 0) + ' · Ж ' + (item.fat || 0) + ' · У ' + (item.carbs || 0) + '</p></' + 'div>';
            const addBtn = document.getElementById('productModalAddBtn');
            if (addBtn) {
                addBtn.innerHTML = '<span class="material-symbols-rounded icon-sm">add_shopping_cart</span> В корзину';
                addBtn.onclick = () => { addToCart(item); closeModal('productModal'); };
            }
            modal.style.display = 'flex';
        }

        window.onclick = e => { 
            if (e.target.classList.contains('modal')) e.target.style.display = 'none'; 
            if (!e.target.closest('.profile-section')) document.getElementById('profileDropdown').classList.remove('show');
            if (!e.target.closest('.search-container')) {
                const panel = document.getElementById('searchFiltersPanel');
                const btn = document.getElementById('searchFilterBtn');
                if (panel) panel.classList.remove('show');
                if (btn) btn.setAttribute('aria-expanded', 'false');
            }
        };
