import React, { useState } from 'react';
import { Upload, X, Check, Image as ImageIcon } from 'lucide-react';

interface LogoUploaderModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentLogoUrl?: string;
  onSaveLogo: (url: string) => void;
  cabinetName: string;
}

export const LogoUploaderModal: React.FC<LogoUploaderModalProps> = ({
  isOpen,
  onClose,
  currentLogoUrl,
  onSaveLogo,
  cabinetName,
}) => {
  const [previewUrl, setPreviewUrl] = useState<string>(currentLogoUrl || '');
  const [errorMsg, setErrorMsg] = useState<string>('');

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMsg('Por favor selecione um arquivo de imagem válido (PNG, SVG, JPG, WebP).');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setErrorMsg('O arquivo deve ter no máximo 2MB.');
      return;
    }

    setErrorMsg('');
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setPreviewUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    onSaveLogo(previewUrl);
    onClose();
  };

  const handleRemove = () => {
    setPreviewUrl('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-slate-900 text-sm">Identidade Visual do Gabinete</h3>
            <p className="text-xs text-slate-500 mt-0.5">{cabinetName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
            aria-label="Fechar modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed">
            Faça upload do brasão oficial do Estado, logo do mandato ou símbolo do parlamentar. Formato recomendado: PNG transparente ou SVG, altura mínima 80px.
          </p>

          <div className="border-2 border-dashed border-slate-200 hover:border-[#176B80] rounded-xl p-6 text-center transition-colors bg-slate-50/50">
            {previewUrl ? (
              <div className="flex flex-col items-center gap-3">
                <div className="w-24 h-24 rounded-lg bg-white border border-slate-200 p-2 flex items-center justify-center shadow-xs">
                  <img src={previewUrl} alt="Logo do Gabinete" className="max-w-full max-h-full object-contain" />
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleRemove}
                    className="text-xs text-rose-600 hover:underline"
                  >
                    Remover imagem
                  </button>
                </div>
              </div>
            ) : (
              <label className="cursor-pointer flex flex-col items-center justify-center gap-2">
                <span className="p-3 rounded-full bg-[#176B80]/10 text-[#176B80]">
                  <Upload className="w-5 h-5" />
                </span>
                <span className="text-xs font-medium text-slate-800">
                  Clique para importar arquivo
                </span>
                <span className="text-[11px] text-slate-400">
                  PNG, SVG ou JPG (máx. 2MB)
                </span>
                <input
                  type="file"
                  accept="image/png, image/svg+xml, image/jpeg, image/webp"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            )}
          </div>

          {errorMsg && (
            <p className="text-xs text-rose-600">{errorMsg}</p>
          )}

          <div className="bg-[#E9F1F4] rounded-lg p-3 text-xs text-slate-700">
            <span className="font-semibold text-[#102C45] block mb-1">Nota de Governança Institucional:</span>
            A marca do gabinete é aplicada em documentos oficiais timbrados (Ofícios, Requerimentos e Devolutivas ao cidadão) respeitando a impessoalidade e as diretrizes do Poder Legislativo.
          </div>
        </div>

        <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 font-medium"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-1.5 text-xs font-medium text-white bg-[#102C45] hover:bg-[#176B80] rounded-lg transition-colors flex items-center gap-1.5"
          >
            <Check className="w-3.5 h-3.5" />
            Aplicar ao Gabinete
          </button>
        </div>
      </div>
    </div>
  );
};
