/* Protocole de sécurité – formulaire chauffeur (sans dépendance, compatible mobiles récents). */
(function () {
    'use strict';

    // ------------------------------------------------------------------ configuration
    const API_BASE = (() => {
        const q = new URLSearchParams(location.search).get('api');
        if (q) return q.replace(/\/$/, '');
        return location.hostname.endsWith('github.io') ? 'https://protocole-backend.onrender.com' : '';
    })();
    const DRAFT_KEY = 'protocole-issy-brouillon-v2';
    const ID_KEY = 'protocole-issy-identite-v2';
    const HIST_KEY = 'protocole-issy-entreprises';
    const LANG_KEY = 'protocole-issy-langue';
    const DRAFT_MAX_AGE = 12 * 60 * 60 * 1000;
    const STEPS = 6;
    const IDENTITY_FIELDS = ['transporteur', 'fournisseur', 'nom', 'telephone', 'immatriculation', 'adresse'];
    const EMPTY_ANSWERS = new Set(['-', '--', '.', '..', '...', '/', '?', 'x', 'xx', 'xxx', 'na', 'n/a', 'nc', 'n.c', 'nr',
        'rien', 'aucun', 'aucune', 'ras', 'r.a.s', 'non', 'oui', 'idem', 'test', 'divers', 'autre', 'none', 'nothing', 'nada', 'ok']);

    const yesNo = [['oui', null, null, 'yes'], ['non', null, null, 'no']];
    const GROUPS = {
        epi: { type: 'checkbox', prefix: 'epi.', items: [
            ['casque', 'epi-casque'], ['gants', 'epi-gants'], ['chaussures', 'epi-chaussures'],
            ['haute_visibilite', ['epi-gilet', 'epi-veste']], ['pantalon', 'epi-pantalon']] },
        tonnage: { type: 'radio', prefix: 'opt.tonnage.', items: [['moins_3t5', 'veh-moins_3t5'], ['plus_3t5', 'veh-plus_3t5']] },
        hauteur_ok: { type: 'radio', items: yesNo },
        longueur_ok: { type: 'radio', items: yesNo },
        caracteristiques: { type: 'checkbox', prefix: 'opt.car.', items: [
            ['articule', 'car-articule'], ['toupie', 'car-toupie'], ['citerne', 'car-citerne'], ['benne', 'car-benne'],
            ['plateau', 'car-plateau'], ['bache_sol', 'car-bache_sol'], ['porte_engin', 'car-porte_engin'], ['fourgon', null, '🚐']] },
        manutention: { type: 'checkbox', prefix: 'opt.man.', items: [
            ['grue_aux', 'man-grue_aux'], ['hayon', 'man-hayon'], ['benne_basc', 'man-benne_basc'],
            ['transpalette', 'man-transpalette'], ['diable', 'man-diable'], ['elingues', 'man-elingues']] },
        operation: { type: 'radio', prefix: 'opt.op.', items: [['dechargement', null, '⬇️'], ['chargement', null, '⬆️'], ['les_deux', null, '↕️']] },
        realisation: { type: 'radio', prefix: 'opt.real.', items: [['transporteur', null, '🚚'], ['accueil', null, '🏗️']] },
        produits_dangereux: { type: 'radio', items: yesNo },
        dangers: { type: 'checkbox', prefix: 'opt.ghs.', items: [
            ['explosif', 'ghs-explosif'], ['inflammable', 'ghs-inflammable'], ['comburant', 'ghs-comburant'],
            ['gaz', 'ghs-gaz'], ['nocif', 'ghs-nocif'], ['corrosif', 'ghs-corrosif'], ['toxique', 'ghs-toxique'],
            ['sante', 'ghs-sante'], ['environnement', 'ghs-environnement']] },
        conditionnement: { type: 'checkbox', prefix: 'opt.cond.', items: [
            ['colis', 'cond-colis'], ['palette', 'cond-palette'], ['panier', 'cond-panier'], ['rack', 'cond-rack'],
            ['caisse_palette', 'cond-caisse_palette'], ['big_bag', 'cond-big_bag'], ['bidon', 'cond-bidon'],
            ['benne', 'cond-benne'], ['container', 'cond-container']] },
    };
    const FIELD_STEP = {
        lu_protocole: 1, epi: 2,
        transporteur: 3, fournisseur: 3, entreprise: 3, nom: 3, telephone: 3, immatriculation: 3, adresse: 3,
        tonnage: 4, hauteur_ok: 4, longueur_ok: 4, caracteristiques: 4, caracteristique_autre: 4, manutention: 4,
        operation: 5, realisation: 5, matieres: 5, produits_dangereux: 5, dangers: 5, conditionnement: 5,
        conditionnement_autre: 5, poids_kg: 5, dim_longueur: 5, dim_largeur: 5, dim_hauteur: 5, signature: 6,
    };
    const ERROR_KEY = {
        lu_protocole: 'err.accept', epi: 'err.epi', telephone: 'err.phone', immatriculation: 'err.plate',
        matieres: 'err.matieres', tonnage: 'err.choose', hauteur_ok: 'err.choose', longueur_ok: 'err.choose',
        operation: 'err.choose', realisation: 'err.choose', produits_dangereux: 'err.choose',
        caracteristiques: 'err.chooseOne', conditionnement: 'err.chooseOne', dangers: 'err.chooseOne',
        signature: 'err.signature',
    };

    // ------------------------------------------------------------------ éléments
    const $ = (sel, root = document) => root.querySelector(sel);
    const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
    const form = $('#form');
    const btnNext = $('#next');
    const btnBack = $('#back');
    const btnSend = $('#send');
    const formError = $('#formError');

    let lang = 'fr';
    let step = 1;
    let draftId = newId();
    let gps = null;
    let gpsState = 'wait';
    let serverReady = false;

    function newId() {
        if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
        return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    }
    const store = {
        get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
        set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* navigation privée */ } },
        del(k) { try { localStorage.removeItem(k); } catch { /* */ } },
    };

    // ------------------------------------------------------------------ traductions
    function t(key, vars) {
        const dict = window.I18N[lang] || {};
        let s = dict[key] ?? window.I18N.fr[key] ?? key;
        if (vars) Object.keys(vars).forEach((k) => { s = s.replace('{' + k + '}', vars[k]); });
        return s;
    }
    function applyLang(l) {
        lang = window.I18N[l] ? l : 'fr';
        document.documentElement.lang = lang;
        $('#lang').value = lang;
        store.set(LANG_KEY, lang);
        $$('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
        $$('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
        renderProgress();
        updateEpiCount();
        if (step === 6) renderRecap();
        // Les messages d'erreur affichés sont retraduits
        $$('.error-msg').forEach((el) => { if (el.dataset.key) el.textContent = t(el.dataset.key); });
        if (!formError.hidden && formError.dataset.key) formError.textContent = t(formError.dataset.key);
    }
    function detectLang() {
        const saved = store.get(LANG_KEY);
        if (saved && window.I18N[saved]) return saved;
        const nav = (navigator.languages || [navigator.language || 'fr']).map((x) => String(x).slice(0, 2).toLowerCase());
        return nav.find((x) => window.I18N[x]) || 'fr';
    }

    // ------------------------------------------------------------------ construction des tuiles
    function buildGroups() {
        $$('[data-group]').forEach((container) => {
            const name = container.dataset.group;
            const g = GROUPS[name];
            container.innerHTML = '';
            g.items.forEach(([code, icon, emoji, key]) => {
                const label = document.createElement('label');
                label.className = 'opt-card';
                const input = document.createElement('input');
                input.type = g.type;
                input.name = name;
                input.value = code;
                const box = document.createElement('span');
                box.className = 'box';
                const icons = Array.isArray(icon) ? icon : icon ? [icon] : [];
                if (icons.length) {
                    const wrap = document.createElement('span');
                    icons.forEach((ic) => {
                        const img = document.createElement('img');
                        img.src = `assets/icons/${ic}.png`;
                        img.alt = '';
                        img.loading = 'lazy';
                        wrap.appendChild(img);
                    });
                    box.appendChild(wrap);
                } else if (emoji) {
                    const e = document.createElement('span');
                    e.className = 'emoji';
                    e.textContent = emoji;
                    box.appendChild(e);
                }
                const txt = document.createElement('span');
                txt.dataset.i18n = key || (g.prefix + code);
                box.appendChild(txt);
                label.append(input, box);
                container.appendChild(label);
            });
        });
    }

    function renderProgress() {
        const ol = $('#steps');
        ol.innerHTML = '';
        for (let i = 1; i <= STEPS; i++) {
            const li = document.createElement('li');
            li.className = i < step ? 'done' : i === step ? 'current' : '';
            li.innerHTML = `<span class="dot">${i < step ? '✓' : i}</span><span class="name"></span>`;
            li.querySelector('.name').textContent = t('step.' + i);
            if (i < step) {
                li.style.cursor = 'pointer';
                li.addEventListener('click', () => go(i));
            }
            ol.appendChild(li);
        }
    }

    // ------------------------------------------------------------------ valeurs
    function getValues() {
        const v = {};
        $$('input[name], textarea[name]', form).forEach((el) => {
            if (el.name === 'website') return;
            if (GROUPS[el.name]) {
                if (GROUPS[el.name].type === 'checkbox') {
                    v[el.name] = v[el.name] || [];
                    if (el.checked) v[el.name].push(el.value);
                } else if (el.checked) v[el.name] = el.value;
                else if (!(el.name in v)) v[el.name] = '';
            } else if (el.type === 'checkbox') {
                v[el.name] = el.checked;
            } else {
                v[el.name] = el.value.trim();
            }
        });
        return v;
    }
    function setValues(v) {
        Object.keys(v || {}).forEach((name) => {
            const els = $$(`[name="${name}"]`, form);
            els.forEach((el) => {
                if (GROUPS[name]) el.checked = Array.isArray(v[name]) ? v[name].includes(el.value) : v[name] === el.value;
                else if (el.type === 'checkbox') el.checked = Boolean(v[name]);
                else el.value = v[name] ?? '';
            });
        });
        refreshDynamic();
    }

    // ------------------------------------------------------------------ validation (identique au serveur)
    const letters = (s, n) => ((s || '').match(/\p{L}/gu) || []).length >= n;
    const isNum = (s, min, max) => {
        if (s === '' || s === undefined) return null;
        const n = Number(String(s).replace(',', '.').replace(/\s/g, ''));
        return Number.isFinite(n) && n >= min && n <= max;
    };

    function validateStep(s, v = getValues()) {
        const e = {};
        if (s === 1 && !v.lu_protocole) e.lu_protocole = 'err.accept';
        if (s === 2 && (v.epi || []).length < GROUPS.epi.items.length) e.epi = 'err.epi';
        if (s === 3) {
            if (!letters(v.transporteur, 2)) e.transporteur = 'err.required';
            if (!letters(v.entreprise, 2)) e.entreprise = 'err.required';
            if (!letters(v.nom, 3)) e.nom = 'err.required';
            const digits = (v.telephone || '').replace(/\D/g, '');
            if (digits.length < 9 || digits.length > 15) e.telephone = v.telephone ? 'err.phone' : 'err.required';
            const plate = (v.immatriculation || '').toUpperCase().replace(/[\s-]/g, '');
            if (!/^[A-Z0-9]{4,12}$/.test(plate)) e.immatriculation = v.immatriculation ? 'err.plate' : 'err.required';
        }
        if (s === 4) {
            if (!v.tonnage) e.tonnage = 'err.choose';
            if (!v.hauteur_ok) e.hauteur_ok = 'err.choose';
            if (!v.longueur_ok) e.longueur_ok = 'err.choose';
            if (!(v.caracteristiques || []).length && !letters(v.caracteristique_autre, 2)) e.caracteristiques = 'err.chooseOne';
        }
        if (s === 5) {
            if (!v.operation) e.operation = 'err.choose';
            if (!v.realisation) e.realisation = 'err.choose';
            const m = (v.matieres || '').toLowerCase().replace(/[\s.]+$/g, '').trim();
            if (!letters(v.matieres, 3) || EMPTY_ANSWERS.has(m)) e.matieres = 'err.matieres';
            if (!v.produits_dangereux) e.produits_dangereux = 'err.choose';
            if (v.produits_dangereux === 'oui' && !(v.dangers || []).length) e.dangers = 'err.chooseOne';
            if (!(v.conditionnement || []).length && !letters(v.conditionnement_autre, 2)) e.conditionnement = 'err.chooseOne';
            const ranges = { poids_kg: [0.1, 200000], dim_longueur: [0.01, 40], dim_largeur: [0.01, 40], dim_hauteur: [0.01, 40] };
            Object.keys(ranges).forEach((f) => {
                const ok = isNum(v[f], ...ranges[f]);
                if (ok === false) e[f] = 'err.number';
                else if (ok === null && v.realisation === 'accueil') e[f] = 'err.required';
            });
        }
        if (s === 6 && !sig.isSigned()) e.signature = 'err.signature';
        return e;
    }

    function clearErrors() {
        $$('.invalid', form).forEach((el) => el.classList.remove('invalid'));
        $$('.error-msg', form).forEach((el) => el.remove());
        formError.hidden = true;
    }
    function showErrors(errors) {
        clearErrors();
        const fields = Object.keys(errors);
        fields.forEach((f) => {
            let el = $(`[data-field="${f}"]`, form);
            if (!el) return;
            el.classList.add('invalid');
            let host = el;
            if (f.startsWith('dim_')) { host = $('[data-field="dimensions"]', form); host.classList.add('invalid'); }
            if (host.querySelector(':scope > .error-msg')) return;
            const p = document.createElement('p');
            p.className = 'error-msg';
            p.dataset.key = errors[f];
            p.textContent = t(errors[f]);
            host.appendChild(p);
        });
        const first = $('.invalid', form);
        if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return fields.length === 0;
    }
    function showFormError(key) {
        formError.dataset.key = key;
        formError.textContent = t(key);
        formError.hidden = false;
        formError.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // ------------------------------------------------------------------ navigation
    function go(n) {
        step = Math.min(Math.max(1, n), STEPS);
        $$('.step', form).forEach((s) => { s.hidden = Number(s.dataset.step) !== step; });
        btnBack.style.visibility = step === 1 ? 'hidden' : 'visible';
        btnNext.hidden = step === STEPS;
        btnSend.hidden = step !== STEPS;
        formError.hidden = true;
        renderProgress();
        if (step === STEPS) {
            renderRecap();
            sig.resize();
            if (gpsState !== 'ok') locate(15000);
        }
        saveDraft();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    btnNext.addEventListener('click', () => {
        const e = validateStep(step);
        if (!showErrors(e)) return;
        go(step + 1);
    });
    btnBack.addEventListener('click', () => { clearErrors(); go(step - 1); });

    // ------------------------------------------------------------------ comportements dynamiques
    function updateEpiCount() {
        const n = $$('input[name="epi"]:checked', form).length;
        const el = $('#epiCount');
        el.textContent = t('s2.count', { n });
        el.classList.toggle('complete', n === GROUPS.epi.items.length);
    }
    function refreshDynamic() {
        const v = getValues();
        $('#dangersBlock').hidden = v.produits_dangereux !== 'oui';
        $$('.when-accueil').forEach((el) => { el.hidden = v.realisation !== 'accueil'; });
        updateEpiCount();
    }
    form.addEventListener('input', (ev) => {
        const f = ev.target.closest('[data-field]');
        if (f && f.classList.contains('invalid')) {
            f.classList.remove('invalid');
            const msg = f.querySelector(':scope > .error-msg');
            if (msg) msg.remove();
        }
        if (ev.target.name === 'immatriculation') {
            const pos = ev.target.selectionStart;
            ev.target.value = ev.target.value.toUpperCase();
            try { ev.target.setSelectionRange(pos, pos); } catch { /* */ }
        }
        refreshDynamic();
        saveDraftSoon();
    });

    // ------------------------------------------------------------------ récapitulatif
    function renderRecap() {
        const v = getValues();
        const dl = $('#recap');
        dl.innerHTML = '';
        const opt = (group, code) => {
            const g = GROUPS[group];
            const item = g.items.find((i) => i[0] === code);
            return item ? t(item[3] || g.prefix + code) : code;
        };
        const add = (labelKey, value, alert) => {
            const dt = document.createElement('dt');
            dt.textContent = t(labelKey);
            const dd = document.createElement('dd');
            dd.textContent = value || '–';
            if (alert) dd.classList.add('alert');
            dl.append(dt, dd);
        };
        const edit = (s) => {
            const div = document.createElement('div');
            div.className = 'edit';
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = '✎ ' + t('s6.edit') + ' (' + t('step.' + s) + ')';
            b.addEventListener('click', () => go(s));
            div.appendChild(b);
            dl.appendChild(div);
        };
        add('step.2', `${(v.epi || []).length} / ${GROUPS.epi.items.length} ✓`);
        edit(2);
        add('f.transporteur', v.transporteur + (v.fournisseur ? ` (${v.fournisseur})` : ''));
        add('f.entreprise', v.entreprise);
        add('f.nom', `${v.nom} · ${v.telephone}`);
        add('f.immatriculation', v.immatriculation);
        edit(3);
        const car = (v.caracteristiques || []).map((c) => opt('caracteristiques', c));
        if (v.caracteristique_autre) car.push(v.caracteristique_autre);
        add('f.tonnage', [opt('tonnage', v.tonnage), ...car].join(' · '));
        add('f.hauteur', t(v.hauteur_ok === 'oui' ? 'yes' : 'no'), v.hauteur_ok === 'non');
        add('f.longueur', t(v.longueur_ok === 'oui' ? 'yes' : 'no'), v.longueur_ok === 'non');
        if ((v.manutention || []).length) add('f.manutention', v.manutention.map((c) => opt('manutention', c)).join(', '));
        edit(4);
        add('f.operation', `${opt('operation', v.operation)} · ${opt('realisation', v.realisation)}`);
        add('f.matieres', v.matieres);
        add('f.dangereux', v.produits_dangereux === 'oui'
            ? (v.dangers || []).map((c) => opt('dangers', c)).join(', ')
            : t('no'), v.produits_dangereux === 'oui');
        const cond = (v.conditionnement || []).map((c) => opt('conditionnement', c));
        if (v.conditionnement_autre) cond.push(v.conditionnement_autre);
        add('f.conditionnement', cond.join(', '));
        if (v.poids_kg) add('f.poids', v.poids_kg + ' kg');
        if (v.dim_longueur || v.dim_largeur || v.dim_hauteur) {
            add('f.dims', [v.dim_longueur, v.dim_largeur, v.dim_hauteur].map((x) => x || '?').join(' × ') + ' m');
        }
        edit(5);
    }

    // ------------------------------------------------------------------ signature
    const sig = (() => {
        const canvas = $('#signature');
        const ctx = canvas.getContext('2d');
        let strokes = [];
        let current = null;
        const COLOR = '#0b2a6b';
        const WIDTH = 2.8;

        function resize() {
            const r = canvas.getBoundingClientRect();
            if (!r.width) return;
            const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
            canvas.width = Math.round(r.width * dpr);
            canvas.height = Math.round(r.height * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            redraw();
        }
        function drawStroke(c, pts, scale = 1, ox = 0, oy = 0) {
            if (!pts.length) return;
            c.strokeStyle = COLOR;
            c.fillStyle = COLOR;
            c.lineWidth = WIDTH * scale;
            c.lineCap = 'round';
            c.lineJoin = 'round';
            const P = (p) => [(p[0] - ox) * scale, (p[1] - oy) * scale];
            if (pts.length === 1) {
                const [x, y] = P(pts[0]);
                c.beginPath(); c.arc(x, y, (WIDTH * scale) / 2, 0, Math.PI * 2); c.fill();
                return;
            }
            c.beginPath();
            let [x0, y0] = P(pts[0]);
            c.moveTo(x0, y0);
            for (let i = 1; i < pts.length - 1; i++) {
                const [x1, y1] = P(pts[i]);
                const [x2, y2] = P(pts[i + 1]);
                c.quadraticCurveTo(x1, y1, (x1 + x2) / 2, (y1 + y2) / 2);
            }
            const [xl, yl] = P(pts[pts.length - 1]);
            c.lineTo(xl, yl);
            c.stroke();
        }
        function redraw() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            strokes.forEach((s) => drawStroke(ctx, s));
        }
        function pos(e) {
            const r = canvas.getBoundingClientRect();
            return [e.clientX - r.left, e.clientY - r.top];
        }
        canvas.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            canvas.setPointerCapture(e.pointerId);
            current = [pos(e)];
            strokes.push(current);
            redraw();
        });
        canvas.addEventListener('pointermove', (e) => {
            if (!current) return;
            e.preventDefault();
            const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
            evs.forEach((ev) => current.push(pos(ev)));
            redraw();
        });
        const end = () => {
            if (current) {
                current = null;
                const f = canvas.closest('[data-field]');
                if (isSigned() && f.classList.contains('invalid')) {
                    f.classList.remove('invalid');
                    const m = f.querySelector(':scope > .error-msg');
                    if (m) m.remove();
                }
            }
        };
        canvas.addEventListener('pointerup', end);
        canvas.addEventListener('pointercancel', end);
        canvas.addEventListener('pointerleave', end);
        $('#clearSig').addEventListener('click', () => { strokes = []; redraw(); });
        window.addEventListener('resize', () => { if (step === STEPS) resize(); });

        function length() {
            let len = 0;
            strokes.forEach((s) => { for (let i = 1; i < s.length; i++) len += Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]); });
            return len;
        }
        function isSigned() { return length() > 80 && strokes.reduce((n, s) => n + s.length, 0) > 12; }

        /** PNG transparent recadré sur la signature (meilleur rendu dans le PDF). */
        function toDataURL() {
            const all = strokes.flat();
            const minX = Math.min(...all.map((p) => p[0])), maxX = Math.max(...all.map((p) => p[0]));
            const minY = Math.min(...all.map((p) => p[1])), maxY = Math.max(...all.map((p) => p[1]));
            const pad = 8;
            const w = maxX - minX + pad * 2, h = maxY - minY + pad * 2;
            const scale = Math.min(3, 900 / w);
            const out = document.createElement('canvas');
            out.width = Math.max(1, Math.round(w * scale));
            out.height = Math.max(1, Math.round(h * scale));
            const c = out.getContext('2d');
            strokes.forEach((s) => drawStroke(c, s, scale, minX - pad, minY - pad));
            return out.toDataURL('image/png');
        }
        function clear() { strokes = []; redraw(); }
        return { resize, isSigned, toDataURL, clear };
    })();

    // ------------------------------------------------------------------ GPS & serveur
    function setStatus(id, cls, key) {
        const el = $(id);
        el.className = cls;
        el.dataset.i18n = key;
        el.textContent = t(key);
    }
    function updateStatus() {
        setStatus('#gpsStatus', gpsState === 'ok' ? 'ok' : gpsState === 'ko' ? 'ko' : 'wait',
            gpsState === 'ok' ? 'gps.ok' : gpsState === 'ko' ? 'gps.denied' : 'gps.wait');
        setStatus('#serverStatus', serverReady ? 'ok' : 'wait', serverReady ? 'server.ready' : 'server.waking');
    }
    function locate(timeout = 20000) {
        if (!('geolocation' in navigator)) { gpsState = 'ko'; updateStatus(); return Promise.resolve(null); }
        return new Promise((resolve) => {
            navigator.geolocation.getCurrentPosition((p) => {
                gps = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) };
                gpsState = 'ok';
                updateStatus();
                resolve(gps);
            }, () => {
                if (!gps) gpsState = 'ko';
                updateStatus();
                resolve(gps);
            }, { enableHighAccuracy: true, timeout, maximumAge: 120000 });
        });
    }
    function warmup(attempt = 0) {
        // Réveille le serveur Render (gratuit = mise en veille) pendant que le chauffeur remplit le formulaire
        fetch(API_BASE + '/health', { cache: 'no-store' })
            .then((r) => { if (!r.ok) throw new Error(); serverReady = true; updateStatus(); })
            .catch(() => { if (attempt < 8) setTimeout(() => warmup(attempt + 1), 7000); });
    }

    // ------------------------------------------------------------------ brouillon
    let saveTimer = null;
    function saveDraftSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(saveDraft, 400); }
    function saveDraft() {
        if (!$('#success').hidden) return;
        store.set(DRAFT_KEY, { v: getValues(), step, id: draftId, at: Date.now() });
    }
    function restore() {
        const d = store.get(DRAFT_KEY);
        if (d && d.v && Date.now() - d.at < DRAFT_MAX_AGE) {
            setValues(d.v);
            draftId = d.id || draftId;
            // Reprend à la première étape incomplète (jamais au-delà de l'étape enregistrée)
            let target = Math.min(d.step || 1, STEPS);
            for (let s = 1; s < target; s++) {
                if (Object.keys(validateStep(s, d.v)).length) { target = s; break; }
            }
            const hasContent = Object.values(d.v).some((x) => (Array.isArray(x) ? x.length : Boolean(x)));
            if (hasContent) $('#restored').hidden = false;
            return target;
        }
        const id = store.get(ID_KEY);
        if (id) setValues(id);
        return 1;
    }
    function fillHistory() {
        const list = store.get(HIST_KEY) || [];
        $('#entreprises').innerHTML = list.map((e) => `<option value="${e.replace(/"/g, '&quot;')}">`).join('');
    }

    // ------------------------------------------------------------------ envoi
    async function submit() {
        clearErrors();
        const v = getValues();
        for (let s = 1; s <= STEPS; s++) {
            const e = validateStep(s, v);
            if (Object.keys(e).length) {
                if (s !== step) go(s);
                setTimeout(() => showErrors(e), s !== step ? 350 : 0);
                return;
            }
        }
        btnSend.disabled = true;
        btnBack.disabled = true;
        const label = btnSend.innerHTML;
        btnSend.textContent = t('send.sending');
        const slow = setTimeout(() => { if (!serverReady) btnSend.textContent = t('send.slow'); }, 5000);

        if (!gps && gpsState !== 'ko') await Promise.race([locate(7000), new Promise((r) => setTimeout(r, 7000))]);

        const payload = {
            ...v,
            id: draftId,
            lang,
            fonction: 'Chauffeur livreur',
            gps,
            signature: sig.toDataURL(),
            website: form.website.value,
        };
        try {
            const ctrl = new AbortController();
            const timeout = setTimeout(() => ctrl.abort(), 110000);
            const res = await fetch(API_BASE + '/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: ctrl.signal,
            });
            clearTimeout(timeout);
            serverReady = true;
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.ok) return success(data, v);
            if (res.status === 400 && data.errors) {
                const errs = {};
                Object.keys(data.errors).forEach((f) => { errs[f] = ERROR_KEY[f] || 'err.required'; });
                const firstStep = Math.min(...Object.keys(errs).map((f) => FIELD_STEP[f] || 6));
                if (firstStep !== step) go(firstStep);
                setTimeout(() => { showErrors(errs); showFormError('err.fix'); }, 350);
            } else if (res.status === 429) {
                showFormError('err.rate');
            } else {
                showFormError('err.server');
            }
        } catch (err) {
            showFormError('err.network');
        } finally {
            clearTimeout(slow);
            btnSend.disabled = false;
            btnBack.disabled = false;
            btnSend.innerHTML = label;
            applyLang(lang);
        }
        return null;
    }
    btnSend.addEventListener('click', submit);

    function success(data, v) {
        $('#okRef').textContent = data.ref;
        $('#okDate').textContent = `${data.date} – ${data.heure}`;
        $('#okDriver').textContent = data.nom || v.nom;
        $('#okCompany').textContent = data.entreprise || v.entreprise;
        $('#okPlate').textContent = data.immatriculation || v.immatriculation;

        // Mémorise l'identité du chauffeur sur son téléphone pour la prochaine fois
        const id = {};
        IDENTITY_FIELDS.forEach((f) => { id[f] = v[f] || ''; });
        store.set(ID_KEY, id);
        const hist = [v.entreprise, ...(store.get(HIST_KEY) || []).filter((e) => e !== v.entreprise)].slice(0, 12);
        store.set(HIST_KEY, hist);
        store.del(DRAFT_KEY);

        form.hidden = true;
        $('.progress').hidden = true;
        $('#restored').hidden = true;
        $('#success').hidden = false;
        if (navigator.vibrate) navigator.vibrate(200);
        window.scrollTo({ top: 0 });
    }

    $('#restart').addEventListener('click', () => {
        form.reset();
        sig.clear();
        draftId = newId();
        const id = store.get(ID_KEY);
        if (id) setValues(id);
        fillHistory();
        refreshDynamic();
        form.hidden = false;
        $('.progress').hidden = false;
        $('#success').hidden = true;
        go(1);
    });

    // ------------------------------------------------------------------ démarrage
    buildGroups();
    $('#lang').addEventListener('change', (e) => applyLang(e.target.value));
    applyLang(detectLang());
    fillHistory();
    const start = restore();
    go(start);
    updateStatus();
    warmup();
    locate();
})();
