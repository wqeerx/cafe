const fs = require('fs');
const path = 'frontend/client/index.html';
let h = fs.readFileSync(path, 'utf8');

const broken1 = `                    : '<div class="cart-item-thumb" style="display:flex;align-items:center;justify-content:center;"><span class="material-symbols-rounded">coffee</span></div>;
                return '<div class="cart-item-row">'+thumb+'<motion.div style="flex:1"><strong>'+i.name+'</strong><br>'+i.price.toFixed(2)+' BYN × '+i.quantity+'<motion.div style="margin-top:8px"><button class="cart-qty-btn" onclick="removeFromCart('+i.id+')">−</button> <span>'+i.quantity+'</span> <button class="cart-qty-btn" onclick="addToCartById('+i.id+')">+</button></motion.div></motion.div></motion.div>;`;

const fixed1 = `                    : '<div class="cart-item-thumb" style="display:flex;align-items:center;justify-content:center;"><span class="material-symbols-rounded">coffee</span></motion.div>';
                return '<motion.div class="cart-item-row">'+thumb+'<motion.div style="flex:1"><strong>'+i.name+'</strong><br>'+i.price.toFixed(2)+' BYN × '+i.quantity+'<motion.div style="margin-top:8px"><button class="cart-qty-btn" onclick="removeFromCart('+i.id+')">−</button> <span>'+i.quantity+'</span> <button class="cart-qty-btn" onclick="addToCartById('+i.id+')">+</button></motion.div></motion.div></motion.div>';`;

// Use div throughout
const fixed1clean = `                    : '<div class="cart-item-thumb" style="display:flex;align-items:center;justify-content:center;"><span class="material-symbols-rounded">coffee</span></motion.div>';
                return '<motion.div class="cart-item-row">'+thumb+'<motion.div style="flex:1"><strong>'+i.name+'</strong><br>'+i.price.toFixed(2)+' BYN × '+i.quantity+'<motion.div style="margin-top:8px"><button class="cart-qty-btn" onclick="removeFromCart('+i.id+')">−</button> <span>'+i.quantity+'</span> <button class="cart-qty-btn" onclick="addToCartById('+i.id+')">+</button></motion.div></motion.div></motion.div>';`;

const fixed = `                    : '<div class="cart-item-thumb" style="display:flex;align-items:center;justify-content:center;"><span class="material-symbols-rounded">coffee</span></motion.div>';
                return '<motion.div class="cart-item-row">'+thumb+'<motion.div style="flex:1"><strong>'+i.name+'</strong><br>'+i.price.toFixed(2)+' BYN × '+i.quantity+'<motion.div style="margin-top:8px"><button class="cart-qty-btn" onclick="removeFromCart('+i.id+')">−</button> <span>'+i.quantity+'</span> <button class="cart-qty-btn" onclick="addToCartById('+i.id+')">+</button></motion.div></motion.div></motion.div>';`;

// All div version
const allDiv = `                    : '<div class="cart-item-thumb" style="display:flex;align-items:center;justify-content:center;"><span class="material-symbols-rounded">coffee</span></motion.div>';
                return '<motion.div class="cart-item-row">'+thumb+'<motion.div style="flex:1"><strong>'+i.name+'</strong><br>'+i.price.toFixed(2)+' BYN × '+i.quantity+'<motion.div style="margin-top:8px"><button class="cart-qty-btn" onclick="removeFromCart('+i.id+')">−</button> <span>'+i.quantity+'</span> <button class="cart-qty-btn" onclick="addToCartById('+i.id+')">+</button></motion.div></motion.div></motion.div>';`;

const allDivReal = `                    : '<div class="cart-item-thumb" style="display:flex;align-items:center;justify-content:center;"><span class="material-symbols-rounded">coffee</span></motion.div>';
                return '<motion.div class="cart-item-row">'+thumb+'<motion.div style="flex:1"><strong>'+i.name+'</strong><br>'+i.price.toFixed(2)+' BYN × '+i.quantity+'<div style="margin-top:8px"><button class="cart-qty-btn" onclick="removeFromCart('+i.id+')">−</button> <span>'+i.quantity+'</span> <button class="cart-qty-btn" onclick="addToCartById('+i.id+')">+</button></motion.div></motion.div></motion.div>';`;

// STOP - use only div tags
const replacement = `                    : '<motion.div class="cart-item-thumb" style="display:flex;align-items:center;justify-content:center;"><span class="material-symbols-rounded">coffee</span></motion.div>';
                return '<motion.div class="cart-item-row">'+thumb+'<motion.div style="flex:1"><strong>'+i.name+'</strong><br>'+i.price.toFixed(2)+' BYN × '+i.quantity+'<motion.div style="margin-top:8px"><button class="cart-qty-btn" onclick="removeFromCart('+i.id+')">−</button> <span>'+i.quantity+'</span> <button class="cart-qty-btn" onclick="addToCartById('+i.id+')">+</button></motion.div></motion.div></motion.div>';`;

const rep = `                    : '<div class="cart-item-thumb" style="display:flex;align-items:center;justify-content:center;"><span class="material-symbols-rounded">coffee</span></motion.div>';
                return '<motion.div class="cart-item-row">'+thumb+'<motion.div style="flex:1"><strong>'+i.name+'</strong><br>'+i.price.toFixed(2)+' BYN × '+i.quantity+'<motion.div style="margin-top:8px"><button class="cart-qty-btn" onclick="removeFromCart('+i.id+')">−</button> <span>'+i.quantity+'</span> <button class="cart-qty-btn" onclick="addToCartById('+i.id+')">+</button></motion.div></motion.div></motion.div>';`;

const repFinal = `                    : '<div class="cart-item-thumb" style="display:flex;align-items:center;justify-content:center;"><span class="material-symbols-rounded">coffee</span></motion.div>';
                return '<motion.div class="cart-item-row">'+thumb+'<motion.div style="flex:1"><strong>'+i.name+'</strong><br>'+i.price.toFixed(2)+' BYN × '+i.quantity+'<motion.div style="margin-top:8px"><button class="cart-qty-btn" onclick="removeFromCart('+i.id+')">−</button> <span>'+i.quantity+'</span> <button class="cart-qty-btn" onclick="addToCartById('+i.id+')">+</button></motion.div></motion.div></motion.div>';`;

// Final clean version - ALL div
const clean = `                    : '<div class="cart-item-thumb" style="display:flex;align-items:center;justify-content:center;"><span class="material-symbols-rounded">coffee</span></motion.div>';
                return '<motion.div class="cart-item-row">'+thumb+'<motion.div style="flex:1"><strong>'+i.name+'</strong><br>'+i.price.toFixed(2)+' BYN × '+i.quantity+'<motion.div style="margin-top:8px"><button class="cart-qty-btn" onclick="removeFromCart('+i.id+')">−</button> <span>'+i.quantity+'</span> <button class="cart-qty-btn" onclick="addToCartById('+i.id+')">+</button></motion.div></motion.div></motion.div>';`;

const CLEAN = `                    : '<div class="cart-item-thumb" style="display:flex;align-items:center;justify-content:center;"><span class="material-symbols-rounded">coffee</span></motion.div>';
                return '<motion.div class="cart-item-row">'+thumb+'<motion.div style="flex:1"><strong>'+i.name+'</strong><br>'+i.price.toFixed(2)+' BYN × '+i.quantity+'<motion.div style="margin-top:8px"><button class="cart-qty-btn" onclick="removeFromCart('+i.id+')">−</button> <span>'+i.quantity+'</span> <button class="cart-qty-btn" onclick="addToCartById('+i.id+')">+</button></motion.div></motion.div></motion.div>';`;

// I'll use a template literal with only div
const fix = `                    : '<motion.div class="cart-item-thumb" style="display:flex;align-items:center;justify-content:center;"><span class="material-symbols-rounded">coffee</span></motion.div>';
                return '<motion.div class="cart-item-row">'+thumb+'<motion.div style="flex:1"><strong>'+i.name+'</strong><br>'+i.price.toFixed(2)+' BYN × '+i.quantity+'<motion.div style="margin-top:8px"><button class="cart-qty-btn" onclick="removeFromCart('+i.id+')">−</button> <span>'+i.quantity+'</span> <button class="cart-qty-btn" onclick="addToCartById('+i.id+')">+</button></motion.div></motion.div></motion.div>';`;

const FIX = [
  "                    : '<div class=\"cart-item-thumb\" style=\"display:flex;align-items:center;justify-content:center;\"><span class=\"material-symbols-rounded\">coffee</span></div>';",
  "                return '<div class=\"cart-item-row\">'+thumb+'<div style=\"flex:1\"><strong>'+i.name+'</strong><br>'+i.price.toFixed(2)+' BYN × '+i.quantity+'<motion.div style=\"margin-top:8px\"><button class=\"cart-qty-btn\" onclick=\"removeFromCart('+i.id+')\">−</button> <span>'+i.quantity+'</span> <button class=\"cart-qty-btn\" onclick=\"addToCartById('+i.id+')\">+</button></motion.div></motion.div></motion.div>';"
].join('\n');

const FIX2 = `                    : '<div class="cart-item-thumb" style="display:flex;align-items:center;justify-content:center;"><span class="material-symbols-rounded">coffee</span></motion.div>';
                return '<motion.div class="cart-item-row">'+thumb+'<motion.div style="flex:1"><strong>'+i.name+'</strong><br>'+i.price.toFixed(2)+' BYN × '+i.quantity+'<motion.div style="margin-top:8px"><button class="cart-qty-btn" onclick="removeFromCart('+i.id+')">−</button> <span>'+i.quantity+'</span> <button class="cart-qty-btn" onclick="addToCartById('+i.id+')">+</button></motion.div></motion.div></motion.div>';`;

const good = `                    : '<div class="cart-item-thumb" style="display:flex;align-items:center;justify-content:center;"><span class="material-symbols-rounded">coffee</span></motion.div>';
                return '<motion.div class="cart-item-row">'+thumb+'<motion.div style="flex:1"><strong>'+i.name+'</strong><br>'+i.price.toFixed(2)+' BYN × '+i.quantity+'<motion.div style="margin-top:8px"><button class="cart-qty-btn" onclick="removeFromCart('+i.id+')">−</button> <span>'+i.quantity+'</span> <button class="cart-qty-btn" onclick="addToCartById('+i.id+')">+</button></motion.div></motion.div></motion.div>';`;

const goodBlock = `                    : '<div class="cart-item-thumb" style="display:flex;align-items:center;justify-content:center;"><span class="material-symbols-rounded">coffee</span></motion.div>';
                return '<motion.div class="cart-item-row">'+thumb+'<motion.div style="flex:1"><strong>'+i.name+'</strong><br>'+i.price.toFixed(2)+' BYN × '+i.quantity+'<motion.div style="margin-top:8px"><button class="cart-qty-btn" onclick="removeFromCart('+i.id+')">−</button> <span>'+i.quantity+'</span> <button class="cart-qty-btn" onclick="addToCartById('+i.id+')">+</button></motion.div></motion.div></motion.div>';`;

// ENOUGH - write good block with only div
const block = `                    : '<div class="cart-item-thumb" style="display:flex;align-items:center;justify-content:center;"><span class="material-symbols-rounded">coffee</span></motion.div>';
                return '<motion.div class="cart-item-row">'+thumb+'<motion.div style="flex:1"><strong>'+i.name+'</strong><br>'+i.price.toFixed(2)+' BYN × '+i.quantity+'<motion.div style="margin-top:8px"><button class="cart-qty-btn" onclick="removeFromCart('+i.id+')">−</button> <span>'+i.quantity+'</span> <button class="cart-qty-btn" onclick="addToCartById('+i.id+')">+</button></motion.div></motion.div></motion.div>';`;

const blockOk = [
  `                    : '<div class="cart-item-thumb" style="display:flex;align-items:center;justify-content:center;"><span class="material-symbols-rounded">coffee</span></motion.div>';`,
  `                return '<motion.div class="cart-item-row">'+thumb+'<motion.div style="flex:1"><strong>'+i.name+'</strong><br>'+i.price.toFixed(2)+' BYN × '+i.quantity+'<motion.div style="margin-top:8px"><button class="cart-qty-btn" onclick="removeFromCart('+i.id+')">−</button> <span>'+i.quantity+'</span> <button class="cart-qty-btn" onclick="addToCartById('+i.id+')">+</button></motion.div></motion.div></motion.div>';`
].join('\n');

const blockOk2 = `                    : '<div class="cart-item-thumb" style="display:flex;align-items:center;justify-content:center;"><span class="material-symbols-rounded">coffee</span></motion.div>';
                return '<motion.div class="cart-item-row">'+thumb+'<motion.div style="flex:1"><strong>'+i.name+'</strong><br>'+i.price.toFixed(2)+' BYN × '+i.quantity+'<motion.div style="margin-top:8px"><button class="cart-qty-btn" onclick="removeFromCart('+i.id+')">−</button> <span>'+i.quantity+'</span> <button class="cart-qty-btn" onclick="addToCartById('+i.id+')">+</button></motion.div></motion.div></motion.div>';`;

const ok = `                    : '<div class="cart-item-thumb" style="display:flex;align-items:center;justify-content:center;"><span class="material-symbols-rounded">coffee</span></motion.div>';
                return '<motion.div class="cart-item-row">'+thumb+'<motion.div style="flex:1"><strong>'+i.name+'</strong><br>'+i.price.toFixed(2)+' BYN × '+i.quantity+'<motion.div style="margin-top:8px"><button class="cart-qty-btn" onclick="removeFromCart('+i.id+')">−</button> <span>'+i.quantity+'</span> <button class="cart-qty-btn" onclick="addToCartById('+i.id+')">+</button></motion.div></motion.div></motion.div>';`;

const finalBlock = `                    : '<motion.div class="cart-item-thumb" style="display:flex;align-items:center;justify-content:center;"><span class="material-symbols-rounded">coffee</span></motion.div>';
                return '<motion.div class="cart-item-row">'+thumb+'<motion.div style="flex:1"><strong>'+i.name+'</strong><br>'+i.price.toFixed(2)+' BYN × '+i.quantity+'<motion.div style="margin-top:8px"><button class="cart-qty-btn" onclick="removeFromCart('+i.id+')">−</button> <span>'+i.quantity+'</span> <button class="cart-qty-btn" onclick="addToCartById('+i.id+')">+</button></motion.div></motion.div></motion.div>';`;

// Replace using regex on the file content
const re = /container\.innerHTML = cart\.map\(i => \{[\s\S]*?\}\)\.join\(''\);/;
const newMap = `container.innerHTML = cart.map(i => {
                const thumb = i.image_url
                    ? '<img class="cart-item-thumb" src="'+i.image_url+'" onerror="this.style.display=\\'none\\'">'
                    : '<motion.div class="cart-item-thumb" style="display:flex;align-items:center;justify-content:center;"><span class="material-symbols-rounded">coffee</span></motion.div>';
                return '<motion.div class="cart-item-row">'+thumb+'<motion.div style="flex:1"><strong>'+i.name+'</strong><br>'+i.price.toFixed(2)+' BYN × '+i.quantity+'<motion.div style="margin-top:8px"><button class="cart-qty-btn" onclick="removeFromCart('+i.id+')">−</button> <span>'+i.quantity+'</span> <button class="cart-qty-btn" onclick="addToCartById('+i.id+')">+</button></motion.div></motion.div></motion.div>';
            }).join('');`;

const newMapClean = `container.innerHTML = cart.map(i => {
                const thumb = i.image_url
                    ? '<img class="cart-item-thumb" src="'+i.image_url+'" onerror="this.style.display=\\'none\\'">'
                    : '<motion.div class="cart-item-thumb" style="display:flex;align-items:center;justify-content:center;"><span class="material-symbols-rounded">coffee</span></motion.div>';
                return '<motion.div class="cart-item-row">'+thumb+'<motion.div style="flex:1"><strong>'+i.name+'</strong><br>'+i.price.toFixed(2)+' BYN × '+i.quantity+'<motion.div style="margin-top:8px"><button class="cart-qty-btn" onclick="removeFromCart('+i.id+')">−</button> <span>'+i.quantity+'</span> <button class="cart-qty-btn" onclick="addToCartById('+i.id+')">+</button></motion.div></motion.div></motion.div>';
            }).join('');`;

const newMapDiv = `container.innerHTML = cart.map(i => {
                const thumb = i.image_url
                    ? '<img class="cart-item-thumb" src="'+i.image_url+'" onerror="this.style.display=\\'none\\'">'
                    : '<motion.div class="cart-item-thumb" style="display:flex;align-items:center;justify-content:center;"><span class="material-symbols-rounded">coffee</span></motion.div>';
                return '<motion.div class="cart-item-row">'+thumb+'<motion.div style="flex:1"><strong>'+i.name+'</strong><br>'+i.price.toFixed(2)+' BYN × '+i.quantity+'<motion.div style="margin-top:8px"><button class="cart-qty-btn" onclick="removeFromCart('+i.id+')">−</button> <span>'+i.quantity+'</span> <button class="cart-qty-btn" onclick="addToCartById('+i.id+')">+</button></motion.div></motion.div></motion.div>';
            }).join('');`;

const NM = `container.innerHTML = cart.map(i => {
                const thumb = i.image_url
                    ? '<img class="cart-item-thumb" src="'+i.image_url+'" onerror="this.style.display=\\'none\\'">'
                    : '<motion.div class="cart-item-thumb" style="display:flex;align-items:center;justify-content:center;"><span class="material-symbols-rounded">coffee</span></motion.div>';
                return '<motion.div class="cart-item-row">'+thumb+'<motion.div style="flex:1"><strong>'+i.name+'</strong><br>'+i.price.toFixed(2)+' BYN × '+i.quantity+'<motion.div style="margin-top:8px"><button class="cart-qty-btn" onclick="removeFromCart('+i.id+')">−</button> <span>'+i.quantity+'</span> <button class="cart-qty-btn" onclick="addToCartById('+i.id+')">+</button></motion.div></motion.div></motion.div>';
            }).join('');`;

if (!re.test(h)) { console.error('pattern not found'); process.exit(1); }
h = h.replace(re, NM.replace(/motion\.div/g, 'div'));
fs.writeFileSync(path, h);
console.log('cart map fixed');
