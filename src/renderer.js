'use strict';

(() => {
  const $ = (selector) => document.querySelector(selector);
  const els = {
    chrome: $('#chrome'), tabs: $('#tabs'), address: $('#address'), addressForm: $('#addressForm'),
    back: $('#back'), forward: $('#forward'), reload: $('#reload'), home: $('#home'),
    bookmark: $('#bookmark'), homeScreen: $('#homeScreen'), homeSearchForm: $('#homeSearchForm'),
    homeSearch: $('#homeSearch'), greeting: $('#greeting'), quickLinks: $('#quickLinks'),
    sidePanel: $('#sidePanel'), panelTitle: $('#panelTitle'), panelContent: $('#panelContent'),
    toast: $('#toast'), confirmBackdrop: $('#confirmBackdrop'), confirmTitle: $('#confirmTitle'),
    confirmMessage: $('#confirmMessage'), confirmCancel: $('#confirmCancel'), confirmAccept: $('#confirmAccept')
  };

  let state = null;
  let currentPanel = null;
  let toastTimer = null;
  let confirmCallback = null;

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
  }

  function activeTab() {
    return state?.tabs?.find((tab) => tab.id === state.activeTabId) || null;
  }

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2500);
  }

  function sendLayout() {
    const chromeHeight = Math.ceil(els.chrome.getBoundingClientRect().height);
    const sidePanelWidth = els.sidePanel.hidden ? 0 : Math.min(340, Math.floor(window.innerWidth * 0.88));
    window.pexlora.setLayout({ chromeHeight, sidePanelWidth });
  }

  function renderTabs() {
    if (!state) return;
    els.tabs.innerHTML = '';
    for (const tab of state.tabs) {
      const button = document.createElement('div');
      button.className = `tab${tab.id === state.activeTabId ? ' active' : ''}${tab.private ? ' private' : ''}`;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', String(tab.id === state.activeTabId));
      button.dataset.tabId = String(tab.id);

      const icon = document.createElement('span');
      icon.className = 'tab-icon';
      icon.textContent = tab.private ? '◐' : (tab.home ? 'P' : '◉');
      const label = document.createElement('span');
      label.className = 'tab-label';
      label.textContent = tab.title || (tab.home ? 'Nova guia' : 'Carregando…');
      button.append(icon, label);
      if (tab.loading) {
        const spinner = document.createElement('span');
        spinner.className = 'tab-loading';
        button.append(spinner);
      }
      const close = document.createElement('button');
      close.className = 'tab-close';
      close.type = 'button';
      close.title = 'Fechar guia';
      close.setAttribute('aria-label', 'Fechar guia');
      close.dataset.action = 'close-tab';
      close.textContent = '×';
      button.append(close);
      els.tabs.append(button);
    }
  }

  function renderBrowserState() {
    if (!state) return;
    renderTabs();
    const tab = activeTab();
    const onHome = !tab || tab.home;
    els.homeScreen.hidden = !onHome;
    els.back.disabled = !tab?.canGoBack;
    els.forward.disabled = !tab?.canGoForward;
    if (document.activeElement !== els.address) els.address.value = tab?.url || '';
    els.bookmark.classList.toggle('saved', Boolean(tab?.url && state.bookmarks.some((item) => item.url === tab.url)));
    els.bookmark.textContent = els.bookmark.classList.contains('saved') ? '★' : '☆';
    $('#addressStatus').textContent = tab?.private ? '◐' : (tab?.url ? '●' : '⌕');
    $('#addressStatus').style.color = tab?.private ? '#a58ae8' : '#75a98d';
    if (onHome && tab?.private) {
      els.greeting.textContent = 'Pexlora Private está ativo. Seu histórico desta sessão não será salvo.';
      els.homeSearch.placeholder = 'Pesquisar sem salvar o histórico';
    } else {
      els.homeSearch.placeholder = 'Pesquisar na web ou inserir endereço';
      els.greeting.textContent = getGreeting();
    }
    if (currentPanel) renderPanel();
    sendLayout();
  }

  function getGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Bom dia.';
    if (hour < 18) return 'Boa tarde.';
    return 'Boa noite.';
  }

  function openPanel(type) {
    currentPanel = type;
    els.sidePanel.hidden = false;
    renderPanel();
    sendLayout();
  }

  function closePanel() {
    currentPanel = null;
    els.sidePanel.hidden = true;
    sendLayout();
  }

  function panelEmpty(message) {
    return `<div class="empty-state">${escapeHtml(message)}</div>`;
  }

  function panelItem(item, type) {
    const title = item.title || item.fileName || item.url || 'Item';
    const sub = item.url || item.savePath || '';
    const action = type === 'history' ? 'open-history' : type === 'bookmarks' ? 'open-bookmark' : 'open-download';
    const removeAction = type === 'history' ? 'remove-history' : type === 'bookmarks' ? 'remove-bookmark' : '';
    return `<div class="panel-item">
      <div class="panel-item-main" role="button" tabindex="0" data-action="${action}" data-url="${escapeHtml(item.url || '')}" data-path="${escapeHtml(item.savePath || '')}">
        <div class="panel-item-title">${escapeHtml(title)}</div>
        <div class="panel-item-url">${escapeHtml(sub)}</div>
      </div>
      ${removeAction ? `<button class="panel-item-action" data-action="${removeAction}" data-url="${escapeHtml(item.url || '')}" title="Remover">×</button>` : ''}
    </div>`;
  }

  function renderHistory() {
    const items = state.history || [];
    return `<div class="panel-section-title">Visitados recentemente</div>${items.length ? items.slice(0, 100).map((item) => panelItem(item, 'history')).join('') : panelEmpty('Seu histórico aparecerá aqui conforme você navegar.')}`;
  }

  function renderBookmarks() {
    const items = state.bookmarks || [];
    return `<div class="panel-section-title">Seus favoritos</div>${items.length ? items.map((item) => panelItem(item, 'bookmarks')).join('') : panelEmpty('Você ainda não salvou nenhum favorito. Use a estrela na barra de endereço.')}`;
  }

  function renderDownloads() {
    const items = state.downloads || [];
    if (!items.length) return panelEmpty('Os arquivos baixados pelo Pexlora aparecerão aqui.');
    return `<div class="panel-section-title">Downloads recentes</div>${items.map((item) => {
      const total = Number(item.totalBytes) || 0;
      const received = Number(item.receivedBytes) || 0;
      const percent = total > 0 ? Math.max(0, Math.min(100, Math.round(received / total * 100))) : 0;
      return `<div class="panel-item">
        <div class="panel-item-main" data-action="open-download" data-path="${escapeHtml(item.savePath)}">
          <div class="panel-item-title">${escapeHtml(item.fileName)}</div>
          <div class="panel-item-url">${escapeHtml(item.state)}${total ? ` · ${percent}%` : ''}</div>
          ${item.state === 'Baixando' ? `<div class="download-progress"><span style="width:${percent}%"></span></div>` : ''}
        </div>
        <button class="panel-item-action" data-action="show-download" data-path="${escapeHtml(item.savePath)}" title="Mostrar na pasta">↗</button>
      </div>`;
    }).join('')}
    <div class="panel-button-row"><button class="secondary-button" data-action="clear-downloads">Limpar lista</button></div>`;
  }

  function renderShields() {
    const enabled = Boolean(state.settings.shieldsEnabled);
    return `<div class="panel-card">
      <h3>Pexlora Shields</h3>
      <p>Bloqueio básico de alguns domínios conhecidos de anúncios e rastreamento. Não substitui uma suíte completa de proteção contra rastreadores.</p>
    </div>
    <button class="panel-action" data-action="toggle-shields">
      <span>Bloquear rastreadores<small>${enabled ? 'Ativado' : 'Desativado'}</small></span>
      <span class="toggle ${enabled ? 'on' : ''}" aria-hidden="true"></span>
    </button>
    <div class="panel-card">
      <h3>Como funciona</h3>
      <p>Esta versão usa uma pequena lista local de domínios. Alguns recursos de sites podem não carregar quando o bloqueio está ativo. Você pode desligá-lo nas configurações.</p>
    </div>
    <div class="panel-copy">Lista atual: ${state.trackerBlockListSize || 0} padrões de domínio.</div>`;
  }

  function renderSettings() {
    const searchEngine = state.settings.searchEngine || 'google';
    const enabled = Boolean(state.settings.shieldsEnabled);
    return `<div class="panel-section-title">Pesquisa</div>
      <div class="panel-card"><h3>Motor de pesquisa</h3>
        <select class="setting-select" id="searchEngineSelect">
          <option value="google" ${searchEngine === 'google' ? 'selected' : ''}>Google</option>
          <option value="duckduckgo" ${searchEngine === 'duckduckgo' ? 'selected' : ''}>DuckDuckGo</option>
        </select>
      </div>
      <div class="panel-section-title">Privacidade</div>
      <button class="panel-action" data-action="toggle-shields"><span>Pexlora Shields<small>Bloqueio básico de rastreadores</small></span><span class="toggle ${enabled ? 'on' : ''}"></span></button>
      <button class="panel-action" data-action="new-private"><span>Pexlora Private<small>Não salva histórico local da sessão privada</small></span><span>◐</span></button>
      <div class="panel-section-title">Dados do navegador</div>
      <div class="panel-card"><h3>Limpar dados de navegação</h3><p>Remove histórico, favoritos e dados locais dos sites armazenados pelo Pexlora neste perfil.</p><div class="panel-button-row"><button class="secondary-button danger-button" data-action="clear-data">Limpar dados…</button></div></div>
      <div class="panel-section-title">Sobre</div>
      <div class="panel-card"><h3>Pexlora Browser 0.1.0</h3><p>Versão inicial experimental, baseada no Chromium fornecido pelo Electron.</p></div>`;
  }

  function renderAI() {
    return `<div class="panel-card">
      <h3>Pexlora AI</h3>
      <p>O espaço do assistente já faz parte da interface, mas um serviço de IA ainda não foi conectado. Nenhuma conversa é enviada a terceiros nesta versão.</p>
    </div>
    <div class="panel-card">
      <h3>O que falta para ativar</h3>
      <p>Conectar um provedor de IA, configurar a chave com segurança no lado do servidor e adicionar controles de privacidade para o conteúdo das páginas.</p>
    </div>
    <button class="panel-action" data-action="page-text"><span>Ver um trecho da página atual<small>O texto é extraído localmente, sem chamar uma IA</small></span><span>↗</span></button>
    <div id="pageTextResult"></div>`;
  }

  function renderMenu() {
    const sections = [
      ['bookmarks', 'Favoritos', '☆', 'Ver páginas salvas'],
      ['history', 'Histórico', '◷', 'Ver páginas visitadas'],
      ['downloads', 'Pexlora Downloads', '↓', 'Ver arquivos baixados'],
      ['shields', 'Pexlora Shields', '⛨', 'Controles de proteção'],
      ['ai', 'Pexlora AI', 'AI', 'Assistente'],
      ['settings', 'Configurações', '⚙', 'Preferências do navegador']
    ];
    return sections.map(([action, title, icon, subtitle]) => `<button class="panel-action" data-action="open-panel" data-panel="${action}"><span>${icon}　${title}<small>${subtitle}</small></span><span>›</span></button>`).join('') +
      `<button class="panel-action" data-action="new-private"><span>◐　Pexlora Private<small>Abre uma sessão temporária</small></span><span>›</span></button>`;
  }

  function renderPanel() {
    if (!currentPanel || !state) return;
    const configs = {
      history: ['Histórico', renderHistory],
      bookmarks: ['Favoritos', renderBookmarks],
      downloads: ['Pexlora Downloads', renderDownloads],
      shields: ['Pexlora Shields', renderShields],
      settings: ['Pexlora Settings', renderSettings],
      ai: ['Pexlora AI', renderAI],
      menu: ['Menu do Pexlora', renderMenu]
    };
    const config = configs[currentPanel] || configs.menu;
    els.panelTitle.textContent = config[0];
    els.panelContent.innerHTML = config[1]();
  }

  function confirmAction(title, message, callback, acceptLabel = 'Continuar') {
    els.confirmTitle.textContent = title;
    els.confirmMessage.textContent = message;
    els.confirmAccept.textContent = acceptLabel;
    confirmCallback = callback;
    els.confirmBackdrop.hidden = false;
  }

  function closeConfirm() {
    els.confirmBackdrop.hidden = true;
    confirmCallback = null;
  }

  function openUrl(url) {
    if (!url) return;
    window.pexlora.navigate({ id: state?.activeTabId, value: url });
    closePanel();
  }

  async function addBookmark() {
    const result = await window.pexlora.addBookmark();
    showToast(result.message || 'Não foi possível salvar o favorito.');
    if (result.ok) els.bookmark.classList.add('saved');
  }

  function bindStaticEvents() {
    $('#newTab').addEventListener('click', () => window.pexlora.createTab());
    $('#privateTab').addEventListener('click', () => window.pexlora.createTab({ private: true }));
    els.back.addEventListener('click', () => window.pexlora.back());
    els.forward.addEventListener('click', () => window.pexlora.forward());
    els.reload.addEventListener('click', () => window.pexlora.reload());
    els.home.addEventListener('click', () => window.pexlora.home());
    els.bookmark.addEventListener('click', addBookmark);
    $('#shields').addEventListener('click', () => openPanel('shields'));
    $('#ai').addEventListener('click', () => openPanel('ai'));
    $('#menu').addEventListener('click', () => openPanel(currentPanel === 'menu' ? null : 'menu'));
    $('#panelClose').addEventListener('click', closePanel);
    $('#openSettings').addEventListener('click', () => openPanel('settings'));
    $('#manageFavorites').addEventListener('click', () => openPanel('bookmarks'));

    els.addressForm.addEventListener('submit', (event) => {
      event.preventDefault();
      openUrl(els.address.value);
      els.address.blur();
    });
    els.homeSearchForm.addEventListener('submit', (event) => {
      event.preventDefault();
      openUrl(els.homeSearch.value);
      els.homeSearch.blur();
    });
    els.quickLinks.addEventListener('click', (event) => {
      const button = event.target.closest('[data-url]');
      if (button) openUrl(button.dataset.url);
    });

    els.tabs.addEventListener('click', (event) => {
      const tabElement = event.target.closest('[data-tab-id]');
      if (!tabElement) return;
      const id = Number(tabElement.dataset.tabId);
      if (event.target.closest('[data-action="close-tab"]')) {
        window.pexlora.closeTab(id);
        return;
      }
      window.pexlora.activateTab(id);
    });

    els.panelContent.addEventListener('click', async (event) => {
      const target = event.target.closest('[data-action]');
      if (!target) return;
      const action = target.dataset.action;
      if (action === 'open-panel') return openPanel(target.dataset.panel);
      if (action === 'open-history' || action === 'open-bookmark') return openUrl(target.dataset.url);
      if (action === 'remove-history') {
        window.pexlora.removeHistory(target.dataset.url);
        return;
      }
      if (action === 'remove-bookmark') {
        window.pexlora.removeBookmark(target.dataset.url);
        return;
      }
      if (action === 'open-download') {
        window.pexlora.openDownload(target.dataset.path);
        return;
      }
      if (action === 'show-download') {
        window.pexlora.showDownload(target.dataset.path);
        return;
      }
      if (action === 'clear-downloads') {
        window.pexlora.clearDownloads();
        showToast('Lista de downloads atualizada.');
        return;
      }
      if (action === 'toggle-shields') {
        const nextValue = !state.settings.shieldsEnabled;
        await window.pexlora.updateSettings({ shieldsEnabled: nextValue });
        showToast(nextValue ? 'Pexlora Shields ativado.' : 'Pexlora Shields desativado.');
        return;
      }
      if (action === 'new-private') {
        window.pexlora.createTab({ private: true });
        closePanel();
        return;
      }
      if (action === 'clear-data') {
        confirmAction('Limpar dados de navegação?', 'Isso apagará o histórico, favoritos e dados locais dos sites deste perfil. Esta ação não pode ser desfeita.', async () => {
          await window.pexlora.clearData();
          showToast('Dados de navegação removidos.');
          closePanel();
        }, 'Limpar dados');
        return;
      }
      if (action === 'page-text') {
        const result = await window.pexlora.getPageInfo();
        const container = $('#pageTextResult');
        if (!container) return;
        const text = String(result.text || '').trim();
        if (!text) {
          container.innerHTML = `<div class="empty-state">Não há texto disponível nesta página.</div>`;
          return;
        }
        const firstLines = text.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/).slice(0, 4).join(' ');
        container.innerHTML = `<div class="panel-card"><h3>Trecho da página</h3><p>${escapeHtml(firstLines.slice(0, 1200))}</p></div>`;
      }
    });

    els.panelContent.addEventListener('change', async (event) => {
      if (event.target.id === 'searchEngineSelect') {
        await window.pexlora.updateSettings({ searchEngine: event.target.value });
        showToast('Motor de pesquisa atualizado.');
      }
    });

    els.confirmCancel.addEventListener('click', closeConfirm);
    els.confirmAccept.addEventListener('click', async () => {
      const callback = confirmCallback;
      closeConfirm();
      if (callback) await callback();
    });
    els.confirmBackdrop.addEventListener('click', (event) => {
      if (event.target === els.confirmBackdrop) closeConfirm();
    });

    window.addEventListener('resize', sendLayout);
    window.addEventListener('keydown', (event) => {
      const key = event.key.toLowerCase();
      const mod = event.ctrlKey || event.metaKey;
      if (mod && key === 'l') {
        event.preventDefault();
        els.address.focus();
        els.address.select();
      } else if (mod && key === 't') {
        event.preventDefault();
        window.pexlora.createTab();
      } else if (mod && key === 'w') {
        event.preventDefault();
        if (state?.activeTabId) window.pexlora.closeTab(state.activeTabId);
      } else if (mod && key === 'r') {
        event.preventDefault();
        window.pexlora.reload();
      } else if (mod && key === 'h') {
        event.preventDefault();
        openPanel('history');
      } else if (mod && key === 'j') {
        event.preventDefault();
        openPanel('downloads');
      } else if (event.altKey && event.key === 'ArrowLeft') {
        event.preventDefault();
        window.pexlora.back();
      } else if (event.altKey && event.key === 'ArrowRight') {
        event.preventDefault();
        window.pexlora.forward();
      } else if (event.key === 'Escape' && currentPanel) {
        closePanel();
      }
    });
  }

  function init() {
    bindStaticEvents();
    window.pexlora.onState((nextState) => {
      state = nextState;
      renderBrowserState();
    });
    window.pexlora.onError((error) => showToast(error.message || 'Ocorreu um erro ao abrir esta página.'));
    window.pexlora.onDownloadUpdated(() => {
      if (currentPanel === 'downloads') renderPanel();
    });
    window.pexlora.onFocusAddress(() => {
      els.address.focus();
      els.address.select();
    });
    window.pexlora.onOpenPanel((panel) => openPanel(panel));
    window.pexlora.ready().then((initialState) => {
      state = initialState;
      renderBrowserState();
      sendLayout();
    }).catch((error) => showToast(`Não foi possível iniciar o Pexlora: ${error.message}`));
    els.greeting.textContent = getGreeting();
  }

  init();
})();
