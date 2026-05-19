const API = 'http://localhost:3000/api';
        let currentUser = null;
        let allItems = [];
        let categories = [];
        let cart = [];
        let allOrders = [];

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

        function applyDevMailCode(data, inputId) {
            if (!data || !data.devCode) return false;
            const el = document.getElementById(inputId);
            if (el) el.value = data.devCode;
            alert('Почта на сервере не настроена.\n\nКод: ' + data.devCode + '\n\nПоложите файл .env в корень проекта (npm run setup:env) и перезапустите сервер.');
            return true;
        }
        
        function closeModal(id) { 
            document.getElementById(id).style.display = 'none'; 
            // Очищаем ошибки при закрытии
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
            document.getElementById('productsSection').classList.remove('active');
            document.getElementById('catalog').style.display = 'block';
            const catMax = document.getElementById('catMaxPrice');
            const catSort = document.getElementById('catSort');
            if (catMax) catMax.value = '';
            if (catSort) catSort.value = '';
            scrollToCatalog();
        }

        let currentCategoryProducts = [];

        function applyItemFilters(items, sortVal) {
            let list = [...items];
            const cat = document.getElementById('searchCategory')?.value;
            if (cat) list = list.filter(i => String(i.category_id) === String(cat));
            if (sortVal === 'price_asc') list.sort((a, b) => a.price - b.price);
            else if (sortVal === 'price_desc') list.sort((a, b) => b.price - a.price);
            else if (sortVal === 'popularity') list.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
            return list;
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

        function applyCategoryFilters() {
            const sort = document.getElementById('catSort')?.value || '';
            const maxPrice = document.getElementById('catMaxPrice')?.value;
            let base = [...currentCategoryProducts];
            if (maxPrice) base = base.filter(i => i.price <= parseFloat(maxPrice));
            const products = applyItemFilters(base, sort);
            const container = document.getElementById('productsGrid');
            if (!products.length) { container.innerHTML = '<p>Нет позиций</p>'; return; }
            container.innerHTML = products.map(item => buildProductCard(item)).join('');
        }

        function showCategoryProducts(categoryId, categoryName) {
            currentCategoryProducts = allItems.filter(item => item.category_id == categoryId);
            document.getElementById('catalog').style.display = 'none';
            document.getElementById('productsSection').classList.add('active');
            document.getElementById('categoryTitle').innerText = categoryName;
            applyCategoryFilters();
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
            filtered = applyItemFilters(filtered, document.getElementById('searchSort')?.value || '');
            
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
            showCategoryProducts(categoryId, categoryName);
            setTimeout(() => showProductDetails(item), 300);
            document.getElementById('searchResults').classList.remove('show');
            document.getElementById('searchInput').value = '';
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
            const toast = document.getElementById('successToast');
            toast.innerText = message;
            toast.classList.add('show');
            setTimeout(() => toast.classList.remove('show'), 3000);
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
            if (cart.length === 0) { alert('Корзина пуста'); return; }
            saveCart(); window.location.href = 'checkout.html';
        }

        // Авторизация и профиль
        async function registerSendCode(isResend) {
            const email = document.getElementById('regEmail').value.trim();
            const phone = getPhoneForSubmit('regPhone');
            const fullname = document.getElementById('regName').value.trim();
            if (!fullname || !phone || !email) return alert('Заполните все поля');
            if (!validateEmail('regEmail')) return alert('Введите корректный email');
            const res = await fetch(API + '/auth/register/send-code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, phone, fullname })
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                document.getElementById('regEmailDisplay').innerText = email;
                setRegisterStep(2);
                const dev = applyDevMailCode(data, 'regCode');
                showSuccess(dev ? 'Код подставлен (без почты)' : (isResend ? 'Код отправлен повторно — проверьте почту' : 'Код отправлен — проверьте почту и «Спам»'));
            } else alert(data.error || 'Ошибка');
        }

        async function registerVerifyCode() {
            const email = document.getElementById('regEmail').value.trim();
            const code = document.getElementById('regCode').value.trim();
            if (!code || code.length < 6) return alert('Введите 6-значный код');
            const res = await fetch(API + '/auth/register/verify-code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, code })
            });
            if (res.ok) setRegisterStep(3);
            else alert(await parseApiError(res));
        }

        async function registerComplete() {
            const email = document.getElementById('regEmail').value.trim();
            const code = document.getElementById('regCode').value.trim();
            const p1 = document.getElementById('regPass').value;
            const p2 = document.getElementById('regPass2').value;
            if (!validatePassword(p1)) return alert('Пароль не соответствует требованиям');
            if (p1 !== p2) {
                document.getElementById('regPass2Error').classList.add('show');
                return alert('Пароли не совпадают');
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
            } else alert(data.error || 'Ошибка регистрации');
        }

        async function login() {
            const email = document.getElementById('loginEmail').value.trim();
            const pass = document.getElementById('loginPass').value;
            if (!email || !pass) return alert('Введите email и пароль');
            if (!validateEmail('loginEmail')) return alert('Введите корректный email');
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
            } else alert('Ошибка: ' + (data.error || 'Вход не выполнен'));
        }

        function applyLoggedIn(data) {
            localStorage.setItem('token', data.token);
            currentUser = data.user;
            document.getElementById('authButtons').style.display = 'none';
            document.getElementById('profileSection').style.display = 'block';
            document.getElementById('profileName').innerText = currentUser.fullname || currentUser.email;
            document.getElementById('profileEmail').innerText = currentUser.email;
            updateCart();
        }

        async function forgotSendCode() {
            const email = document.getElementById('forgotEmail').value.trim();
            if (!email) return alert('Введите email');
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
                const dev = applyDevMailCode(data, 'forgotCode');
                showSuccess(dev ? 'Код подставлен (без почты)' : 'Если аккаунт есть — код на email (проверьте «Спам»)');
            } else alert(data.error || 'Ошибка');
        }

        async function forgotReset() {
            const email = document.getElementById('forgotEmail').value.trim();
            const code = document.getElementById('forgotCode').value.trim();
            const p1 = document.getElementById('forgotPass').value;
            const p2 = document.getElementById('forgotPass2').value;
            if (!validatePassword(p1)) return alert('Пароль не соответствует требованиям');
            if (p1 !== p2) return alert('Пароли не совпадают');
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
            } else alert(data.error || 'Ошибка');
        }

        function showEditProfileModal() {
            document.getElementById('editFullname').value = currentUser.fullname || '';
            document.getElementById('editEmail').value = currentUser.email || '';
            document.getElementById('editPhone').value = currentUser.phone || '';
            setupPhoneInput('editPhone');
            document.getElementById('editProfileModal').style.display = 'flex';
        }

        async function updateProfile() {
            let data = { 
                fullname: document.getElementById('editFullname').value, 
                email: document.getElementById('editEmail').value, 
                phone: getPhoneForSubmit('editPhone')
            };
            let res = await fetch(API + '/user/profile', { 
                method: 'PUT', 
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('token') }, 
                body: JSON.stringify(data) 
            });
            if (res.ok) {
                showSuccess('Профиль обновлён');
                currentUser = { ...currentUser, ...data };
                document.getElementById('profileName').innerText = currentUser.fullname || currentUser.email;
                document.getElementById('profileEmail').innerText = currentUser.email;
                closeModal('editProfileModal');
            } else alert('Ошибка');
        }

        function logout() {
            localStorage.removeItem('token');
            currentUser = null;
            cart = [];
            updateCart();
            document.getElementById('authButtons').style.display = 'flex';
            document.getElementById('profileSection').style.display = 'none';
            showSuccess('Вы вышли из системы');
        }

        async function loadCategories() {
            let res = await fetch(API + '/categories');
            categories = await res.json();
            document.getElementById('categoriesGrid').innerHTML = categories.map(cat => `
                <div class="category-card" onclick="showCategoryProducts(${cat.id}, '${cat.name.replace(/'/g, "\\'")}')">
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
            { name: 'Zerno в ТЦ "Green city"', address: 'г. Минск, ул. Притульского 156', hours: '8:00-22:00', phone: '+375 (44) 444-44-44' },
            { name: 'Zerno в ТЦ "Замок"', address: 'г. Минск, ул. Победителей 65', hours: '8:00-22:00', phone: '+375 (44) 444-44-44' },
            { name: 'Zerno на ул. Л.Беды', address: 'г. Минск, ул. Лебедянская 26', hours: '8:00-22:00', phone: '+375 (44) 444-44-44' }
        ];
        document.getElementById('locationsGrid').innerHTML = locations.map(l =>
            '<div class="location-card"><h3><span class="material-symbols-rounded icon-sm">location_on</span> ' + l.name + '</h3>' +
            '<div>' + l.address + '</div><div><span class="material-symbols-rounded icon-sm">schedule</span> ' + l.hours + '</div>' +
            '<div><span class="material-symbols-rounded icon-sm">call</span> ' + l.phone + '</div></div>'
        ).join('');

        window.onload = async () => {
            setupPhoneInput('regPhone');
            let token = localStorage.getItem('token');
            if (token) {
                try {
                    const payload = JSON.parse(atob(token.split('.')[1]));
                    if (payload.role === 'admin' || payload.role === 'employee') {
                        localStorage.removeItem('token');
                        token = null;
                    } else {
                        const res = await fetch(API + '/user/profile', { headers: { 'Authorization': 'Bearer ' + token } });
                        if (res.ok) currentUser = await res.json();
                        else localStorage.removeItem('token');
                    }
                } catch (e) {
                    localStorage.removeItem('token');
                }
            }
            if (currentUser) {
                document.getElementById('authButtons').style.display = 'none';
                document.getElementById('profileSection').style.display = 'block';
                document.getElementById('profileName').innerText = currentUser.fullname || currentUser.email;
                document.getElementById('profileEmail').innerText = currentUser.email || '';
                loadCartStorage();
            } else {
                cart = [];
                document.getElementById('authButtons').style.display = 'flex';
                document.getElementById('profileSection').style.display = 'none';
            }
            updateCart();
            await loadAllItems();
            await loadCategories();
        };

        // Бронирование столов
        async function loadAvailableTables() {
            const date = document.getElementById('bookingDate').value;
            const time = document.getElementById('bookingTime').value;
            if (!date || !time) return;
            
            const res = await fetch(`${API}/tables/availability?date=${date}&time=${time}`);
            const tables = await res.json();
            
            const container = document.getElementById('tablesGrid');
            container.innerHTML = tables.map(table => `
                <div onclick="selectTable(${table.id}, ${table.capacity})" 
                     style="flex:1; min-width: 100px; padding: 15px; text-align: center; 
                            background: ${table.is_booked ? '#dc3545' : '#28a745'}; 
                            color: white; border-radius: 12px; cursor: ${table.is_booked ? 'not-allowed' : 'pointer'};
                            opacity: ${table.is_booked ? 0.6 : 1};">
                    <span class="material-symbols-rounded">chair</span>
                    <div>Стол ${table.number}</div>
                    <div style="font-size: 12px;">${table.capacity} места</div>
                    <div style="font-size: 11px;">${table.is_booked ? 'Занят' : 'Свободен'}</div>
                </div>
            `).join('');
            
            window.selectedTableId = null;
        }

        function selectTable(tableId, capacity) {
            if (!window.selectedTableId) window.selectedTableId = tableId;
            window.selectedTableId = tableId;
            
            document.querySelectorAll('#tablesGrid > div').forEach((el, i) => {
                if (el.style.background === 'rgb(40, 167, 69)' && el.classList) {
                    el.style.border = i === tableId - 1 ? '3px solid #2d2418' : 'none';
                }
            });
        }

        async function createBooking() {
            const date = document.getElementById('bookingDate').value;
            const time = document.getElementById('bookingTime').value;
            const guests = document.getElementById('bookingGuests').value;
            const tableId = window.selectedTableId;
            
            if (!date || !time) { alert('Выберите дату и время'); return; }
            if (!tableId) { alert('Выберите стол'); return; }
            
            const res = await fetch(API + '/bookings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('token') },
                body: JSON.stringify({ table_id: tableId, booking_date: date, booking_time: time, guests })
            });
            const data = await res.json();
            if (res.ok) {
                showSuccess('Бронирование создано! Ожидайте подтверждения.');
                closeModal('bookingModal');
                loadUserBookings();
            } else {
                alert('❌ ' + data.error);
            }
        }

        async function loadUserBookings() {
            if (!currentUser) return;
            const res = await fetch(API + '/my-bookings', { headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') } });
            const bookings = await res.json();
            
            const container = document.getElementById('myBookingsList');
            if (!container) return;
            
            if (bookings.length === 0) {
                container.innerHTML = '<p>У вас пока нет бронирований</p>';
                return;
            }
            
            container.innerHTML = bookings.map(b => `
                <div style="border-bottom: 1px solid #eee; padding: 15px;">
                    <div><strong>Стол ${b.table_number}</strong> (${b.capacity} места)</div>
                    <div>${b.booking_date} в ${b.booking_time}</div>
                    <div>${b.guests} гостей</div>
                    <div>Статус: <span style="background: ${b.status === 'подтверждено' ? '#28a745' : b.status === 'ожидает' ? '#ffc107' : '#dc3545'}; color: white; padding: 2px 8px; border-radius: 20px;">${b.status === 'подтверждено' ? 'Подтверждено' : b.status === 'ожидает' ? 'Ожидает' : 'Отменено'}</span></div>
                    ${b.status === 'ожидает' ? `<button onclick="cancelBooking(${b.id})" style="margin-top:10px; background:#dc3545; border:none; padding:5px 12px; border-radius:20px; color:white; cursor:pointer;">Отменить</button>` : ''}
                </div>
            `).join('');
        }

        async function cancelBooking(bookingId) {
            if (confirm('Отменить бронирование?')) {
                await fetch(API + `/bookings/${bookingId}/cancel`, {
                    method: 'PUT',
                    headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
                });
                loadUserBookings();
            }
        }

        function showBookingModal() {
            const today = new Date().toISOString().split('T')[0];
            document.getElementById('bookingDate').min = today;
            document.getElementById('bookingDate').value = today;
            document.getElementById('bookingTime').value = '12:00';
            document.getElementById('bookingModal').style.display = 'flex';
            loadAvailableTables();
        }

        function showMyBookings() {
            loadUserBookings();
            document.getElementById('myBookingsModal').style.display = 'flex';
        }

        document.getElementById('bookingDate')?.addEventListener('change', () => {
            window.selectedTableId = null;
            document.getElementById('selectedTableDisplay').value = 'Не выбран';
            document.getElementById('bookingGuests').disabled = true;
            loadAvailableTables();
        });
        document.getElementById('bookingTime')
        ?.addEventListener('change', () => {
            window.selectedTableId = null;
            document.getElementById('selectedTableDisplay').value = 'Не выбран';
            document.getElementById('bookingGuests').disabled = true;
            loadAvailableTables();
        });

        // ============ МОДАЛЬНОЕ ОКНО ТОВАРА ============
        function showProductDetails(item) {
            const modal = document.getElementById('productModal');
            if (!modal) return;
            const title = document.getElementById('productModalTitle');
            const content = document.getElementById('productModalContent');
            if (!title || !content) return;
            title.innerText = item.name;
            const img = item.image_url
                ? '<img src="' + item.image_url + '" alt="' + item.name + '" style="width:100%;max-height:220px;object-fit:cover;border-radius:12px;">'
                : '<div style="text-align:center;padding:32px;background:#f5e6d3;border-radius:12px;"><span class="material-symbols-rounded" style="font-size:48px;color:#8a6a5a">coffee</span></div>';
            content.innerHTML = img +
                '<div style="font-size:22px;font-weight:bold;margin-top:12px;">' + item.price.toFixed(2) + ' BYN</div>' +
                (item.description ? '<p style="margin-top:12px;font-size:14px;">' + item.description + '</p>' : '') +
                (item.composition ? '<div style="background:#fef8f0;padding:12px;border-radius:10px;margin-top:10px;"><strong>Состав</strong><br>' + item.composition + '</div>' : '') +
                '<div style="background:#fef8f0;padding:12px;border-radius:10px;margin-top:10px;"><strong>КБЖУ</strong><br>' +
                (item.calories || 0) + ' ккал · Б ' + (item.protein || 0) + ' · Ж ' + (item.fat || 0) + ' · У ' + (item.carbs || 0) + '</div>';
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
        };
