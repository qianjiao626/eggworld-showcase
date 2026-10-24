"use client";

import React, { useState, useEffect } from "react";
import { X, Phone, ShieldCheck, Loader2 } from "lucide-react";

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (phone: string) => void;
}

export default function LoginModal({ isOpen, onClose, onSuccess }: LoginModalProps) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  // 倒计时逻辑
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleSendCode = () => {
    if (!/^1[3-9]\d{9}$/.test(phone)) return alert("请输入正确的手机号");
    setCountdown(60);
    // 以后这里对接腾讯云 SMS API
    console.log("验证码已发送至:", phone);
  };

  const handleLogin = async () => {
    if (!code) return alert("请输入验证码");
    setIsLoading(true);
    
    // 模拟登录请求延迟
    setTimeout(() => {
      setIsLoading(false);
      onSuccess(phone);
      onClose();
    }, 1500);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* 背景遮罩 */}
      <div className="absolute inset-0 bg-[#292524]/40 backdrop-blur-sm" onClick={onClose}></div>
      
      {/* 弹窗主体 */}
      <div className="relative w-full max-w-[400px] bg-white rounded-[2.5rem] shadow-2xl p-10 animate-in zoom-in-95 duration-300">
        <button 
          onClick={onClose}
          className="absolute top-6 right-6 text-[#a8a29e] hover:text-[#292524] transition-colors"
        >
          <X size={24} />
        </button>

        <div className="text-center mb-8">
          <h2 className="text-2xl font-black text-[#292524]">欢迎回来，牛啵！</h2>
          <p className="text-[#78716c] mt-2 text-sm">使用手机号开启你的职场进阶之路</p>
        </div>

        <div className="flex flex-col gap-4">
          {/* 手机号输入 */}
          <div className="relative">
            <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-[#a8a29e]" size={18} />
            <input 
              type="tel" 
              placeholder="请输入手机号"
              className="w-full bg-[#fafaf9] border border-[#e7e5e4] rounded-2xl py-4 pl-12 pr-4 outline-none focus:border-[#ea580c] transition-all text-[15px]"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          {/* 验证码输入 */}
          <div className="flex gap-3">
            <div className="relative flex-1">
              <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 text-[#a8a29e]" size={18} />
              <input 
                type="text" 
                placeholder="验证码"
                className="w-full bg-[#fafaf9] border border-[#e7e5e4] rounded-2xl py-4 pl-12 pr-4 outline-none focus:border-[#ea580c] transition-all text-[15px]"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
            <button 
              onClick={handleSendCode}
              disabled={countdown > 0}
              className="px-4 rounded-2xl bg-[#f1f1f1] text-[#78716c] text-sm font-bold hover:bg-[#e7e5e4] disabled:opacity-50 min-w-[100px]"
            >
              {countdown > 0 ? `${countdown}s` : "获取验证码"}
            </button>
          </div>

          <button 
            onClick={handleLogin}
            disabled={isLoading}
            className="w-full bg-[#ea580c] text-white py-4 rounded-2xl font-black text-lg shadow-lg shadow-orange-200 hover:opacity-90 transition-all flex items-center justify-center gap-2"
          >
            {isLoading ? <Loader2 className="animate-spin" size={24} /> : "立即登录"}
          </button>
        </div>

        <p className="mt-6 text-center text-xs text-[#a8a29e] leading-relaxed">
          未注册手机号验证后自动创建账号<br/>
          登录即代表同意 <span className="text-[#78716c] underline cursor-pointer">用户协议</span> 和 <span className="text-[#78716c] underline cursor-pointer">隐私政策</span>
        </p>
      </div>
    </div>
  );
}
