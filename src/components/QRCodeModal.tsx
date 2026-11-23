import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, Download, QrCode, Share2, X } from 'lucide-react';

interface QRCodeModalProps {
  title: string;
  subtitle?: string;
  url: string;
  onClose: () => void;
}

export const QRCodeModal: React.FC<QRCodeModalProps> = ({
  title,
  subtitle,
  url,
  onClose,
}) => {
  const [svgMarkup, setSvgMarkup] = useState<string>('');
  const [pngUrl, setPngUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    QRCode.toString(url, {
      type: 'svg',
      width: 220,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    })
      .then((svg) => {
        if (!cancelled) setSvgMarkup(svg);
      })
      .catch(() => {});

    QRCode.toDataURL(url, {
      width: 512,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    })
      .then((dataUrl) => {
        if (!cancelled) setPngUrl(dataUrl);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [url]);

  const handleCopy = () => {
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  const handleShare = () => {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      navigator.share({ title, text: subtitle || title, url }).catch(() => {});
    } else {
      handleCopy();
    }
  };

  const handleDownload = () => {
    if (!pngUrl) return;
    const a = document.createElement('a');
    a.href = pngUrl;
    a.download = `zeno-qr-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
      dir="rtl"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-white dark:bg-[#17212b] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <QrCode className="w-4.5 h-4.5 text-sky-600 dark:text-sky-400" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        <div className="p-5 flex flex-col items-center text-center space-y-4">
          {subtitle && (
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{subtitle}</p>
          )}

          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center justify-center">
            {svgMarkup ? (
              <div
                className="w-[210px] h-[210px]"
                dangerouslySetInnerHTML={{ __html: svgMarkup }}
              />
            ) : (
              <div className="w-[210px] h-[210px] bg-slate-100 rounded-xl animate-pulse" />
            )}
          </div>

          <div className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#242f3d] border border-slate-200 dark:border-slate-700 text-[11px] font-mono text-slate-600 dark:text-slate-300 truncate" dir="ltr">
            {url}
          </div>

          <div className="w-full grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="py-2.5 px-3 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'تم النسخ' : 'نسخ'}</span>
            </button>
            <button
              type="button"
              onClick={handleShare}
              className="py-2.5 px-3 rounded-xl bg-slate-100 dark:bg-[#242f3d] hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>مشاركة</span>
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={!pngUrl}
              className="py-2.5 px-3 rounded-xl bg-slate-100 dark:bg-[#242f3d] hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-800 dark:text-slate-100 text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>حفظ</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
