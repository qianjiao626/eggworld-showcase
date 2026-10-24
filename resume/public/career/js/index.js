function openModal() {
    const modal = document.getElementById('wechat-modal');
    const container = document.getElementById('modal-container');
    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.add('opacity-100');
        container.classList.remove('scale-95', 'opacity-0');
        container.classList.add('scale-100', 'opacity-100');
    }, 10);
}

function closeModal() {
    const modal = document.getElementById('wechat-modal');
    const container = document.getElementById('modal-container');
    container.classList.remove('scale-100', 'opacity-100');
    container.classList.add('scale-95', 'opacity-0');
    setTimeout(() => {
        modal.classList.add('hidden');
    }, 300);
}

function copyWeChatId() {
    const id = '';  // 联系方式已移除
    navigator.clipboard.writeText(id).then(() => {
        const btn = document.getElementById('copy-btn');
        const originalText = btn.innerText;
        btn.innerText = '已复制！';
        btn.classList.add('text-green-500');
        setTimeout(() => {
            btn.innerText = originalText;
            btn.classList.remove('text-green-500');
        }, 2000);
    });
}

async function test() {
    const res = await fetch('/wechatpay/createOrder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 1, description: '测试商品' })
    });
    const data = await res.json();
    const qrcodeDiv = document.getElementById('qrcodeDiv');
    qrcodeDiv.innerHTML = '';
    QRCode.toCanvas(qrcodeDiv, data.code_url, { width: 200 }, (error) => {
        if (error) {
            console.error('二维码生成失败:', error);
        } else {
            console.log('二维码生成成功！');
        }
    });
}
