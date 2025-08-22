'use client';

import React, { useState, FormEvent, useEffect, useRef } from 'react';
import { DayPicker } from 'react-day-picker';
import type { DateRange } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { Airport } from '@/app/types';


// --- Componente Reutilizável de Autocomplete (Estilo Apple) ---
const AutocompleteInput = ({ label, placeholder, onSelect, initialValue }: { label: string, placeholder: string, onSelect: (iataCode: string) => void, initialValue: string }) => {
  const [searchTerm, setSearchTerm] = useState(initialValue);
  const [results, setResults] = useState<Airport[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const debounceTimeout = useRef<NodeJS.Timeout | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSearchTerm(initialValue);
  }, [initialValue]);

  useEffect(() => {
    if (searchTerm.length < 3) {
      setResults([]);
      return;
    }
    if (debounceTimeout.current) clearTimeout(debounceTimeout.current);

    debounceTimeout.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/search-airports?keyword=${encodeURIComponent(searchTerm)}`);
        if (response.ok) setResults(await response.json());
        else setResults([]);
      } catch (error) {
        console.error("Erro na busca:", error);
        setResults([]);
      }
      setIsLoading(false);
    }, 500);
  }, [searchTerm]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (location: Airport) => {
    setSearchTerm(location.name);
    onSelect(location.iataCode);
    setShowResults(false);
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">
        {label}
      </label>
      <input
        type="text"
        value={searchTerm}
        onChange={(e) => { setSearchTerm(e.target.value); setShowResults(true); }}
        onFocus={() => setShowResults(true)}
        placeholder={placeholder}
        className="w-full px-4 py-3 rounded-xl border-none bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
      />
      {showResults && searchTerm.length >= 3 && (
        <ul className="absolute z-20 w-full mt-2 bg-white/80 dark:bg-gray-900/80 backdrop-blur-lg border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl max-h-60 overflow-y-auto">
          {isLoading ? (
            <li className="px-4 py-3 text-sm text-gray-500">A procurar...</li>
          ) : results.length > 0 ? (
            results.map((location, index) => (
              <li
                key={`${location.iataCode}-${index}`}
                onClick={() => handleSelect(location)}
                className="px-4 py-3 text-sm text-gray-800 dark:text-gray-200 hover:bg-blue-500 hover:text-white cursor-pointer capitalize transition-colors"
              >
                {location.name}
              </li>
            ))
          ) : (
            <li className="px-4 py-3 text-sm text-gray-500">Nenhum resultado encontrado.</li>
          )}
        </ul>
      )}
    </div>
  );
};
// --- Ícone de Avião ---
const PlaneIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2 h-5 w-5"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" /></svg>
);

// --- Helper de formatação ---
const formatDisplay = (d?: Date) => d ? d.toLocaleDateString('pt-BR') : '';
const toISODate = (d?: Date) => d ? d.toISOString().slice(0, 10) : '';

// --- Componente Principal da Página ---
export default function FlightAlertsPage() {
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');

  // usa react-day-picker range
  const [range, setRange] = useState<DateRange | undefined>(undefined);
  const [departureDate, setDepartureDate] = useState(''); // ISO string YYYY-MM-DD
  const [returnDate, setReturnDate] = useState(''); // ISO string YYYY-MM-DD

  const [passengers, setPassengers] = useState(1);
  const [shortDuration, setShortDuration] = useState(false);
  const [userEmail, setUserEmail] = useState('');

  const [calendarOpen, setCalendarOpen] = useState(false);
  const calendarRef = useRef<HTMLDivElement | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    // sincroniza range com strings ISO usadas no submit
    if (!range) {
      setDepartureDate('');
      setReturnDate('');
      return;
    }
    setDepartureDate(toISODate(range.from));
    setReturnDate(toISODate(range.to));
  }, [range]);

  useEffect(() => {
    const handleClickOutside = (ev: MouseEvent) => {
      if (calendarRef.current && !calendarRef.current.contains(ev.target as Node)) {
        setCalendarOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // FUNÇÃO handleSubmit QUE ESTAVA FALTANDO
   const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setMessage(null);

    if (!origin || !destination || !departureDate || !userEmail) {
      setMessage({ type: 'error', text: 'Por favor, preencha todos os campos obrigatórios.' });
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/create-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ origin, destination, departureDate, returnDate: returnDate || null, passengers, shortDuration, userEmail }),
      });

      if (!response.ok) {
        const errorResult = await response.json().catch(() => null);
        throw new Error(errorResult?.error || response.statusText || 'Erro desconhecido do servidor');
      }

      const result = await response.json();
      setMessage({ type: 'success', text: result.message || 'Alerta criado com sucesso!' });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      setMessage({ type: 'error', text: errorMessage });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-gray-50 dark:bg-black font-sans p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white/70 dark:bg-gray-900/50 backdrop-blur-2xl border border-gray-200/80 dark:border-gray-800/80 shadow-2xl p-8 md:p-10">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Alerta de Voos</h1>
          <p className="text-gray-500 dark:text-gray-400 text-base">Monitorize preços e nós avisamos quando mudarem.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <AutocompleteInput label="Origem" placeholder="Cidade ou aeroporto" onSelect={setOrigin} initialValue="" />
            <AutocompleteInput label="Destino" placeholder="Cidade ou aeroporto" onSelect={setDestination} initialValue="" />
          </div>

          {/* Date range picker - ESTILOS MELHORADOS */}
          <div className="relative" ref={calendarRef}>
            <div className="grid grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">Ida</label>
                <input
                  readOnly
                  value={formatDisplay(range?.from)}
                  onFocus={() => setCalendarOpen(true)}
                  placeholder="Selecione a data de ida"
                  className="w-full px-4 py-3 rounded-xl border-none bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">Volta (Opcional)</label>
                <input
                  readOnly
                  value={formatDisplay(range?.to)}
                  onFocus={() => setCalendarOpen(true)}
                  placeholder="Selecione a data de volta"
                  className="w-full px-4 py-3 rounded-xl border-none bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow cursor-pointer"
                />
              </div>
            </div>

            {/* Calendar overlay com estilos melhorados */}
            {calendarOpen && (
              <div className="absolute z-30 mt-3 bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-5 backdrop-blur-sm" style={{ left: 0, top: 'calc(100% + 8px)', minWidth: 320 }}>
                <DayPicker
                  mode="range"
                  selected={range}
                  onSelect={(r) => setRange(r as DateRange)}
                  className="custom-daypicker"
                  classNames={{
                    months: 'flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0',
                    month: 'space-y-4',
                    caption: 'flex justify-center pt-1 relative items-center',
                    caption_label: 'text-sm font-medium text-gray-900 dark:text-white',
                    nav: 'space-x-1 flex items-center',
                    nav_button: 'h-6 w-6 bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800 rounded flex items-center justify-center',
                    nav_button_previous: 'absolute left-1',
                    nav_button_next: 'absolute right-1',
                    table: 'w-full border-collapse space-y-1',
                    head_row: 'flex',
                    head_cell: 'text-gray-500 dark:text-gray-400 rounded-md w-9 font-normal text-sm',
                    row: 'flex w-full mt-2',
                    cell: 'text-center text-sm p-0 relative [&:has([aria-selected])]:bg-gray-100 dark:[&:has([aria-selected])]:bg-gray-800 first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20',
                    day: 'h-9 w-9 p-0 font-normal aria-selected:opacity-100 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full',
                    day_selected: 'bg-blue-600 text-white hover:bg-blue-700 hover:text-white focus:bg-blue-700 focus:text-white',
                    day_today: 'text-blue-600 dark:text-blue-400 font-semibold',
                    day_outside: 'text-gray-400 dark:text-gray-600 opacity-50',
                    day_disabled: 'text-gray-400 dark:text-gray-600 opacity-50',
                    day_range_middle: 'aria-selected:bg-gray-100 dark:aria-selected:bg-gray-800 aria-selected:text-gray-900 dark:aria-selected:text-white',
                    day_hidden: 'invisible',
                  }}
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-5 items-end">
            <div>
              <label htmlFor="passengers" className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">Passageiros</label>
              <input type="number" id="passengers" value={passengers} onChange={(e) => setPassengers(parseInt(e.target.value || '1', 10))} min={1} className="w-full px-4 py-3 rounded-xl border-none bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow" />
            </div>
            <div className="flex items-center pb-3">
              <input id="shortDuration" type="checkbox" checked={shortDuration} onChange={(e) => setShortDuration(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
              <label htmlFor="shortDuration" className="ml-2 text-sm text-gray-600 dark:text-gray-300">Apenas voos diretos</label>
            </div>
          </div>

          <div>
            <label htmlFor="userEmail" className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">O seu e-mail</label>
            <input type="email" id="userEmail" value={userEmail} onChange={(e) => setUserEmail(e.target.value)} placeholder="voce@exemplo.com" className="w-full px-4 py-3 rounded-xl border-none bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow" />
          </div>

          <div>
            <button type="submit" disabled={isLoading} className="w-full flex items-center justify-center px-6 py-3 text-base font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-105 active:scale-100">
              {isLoading ? 'A criar Alerta...' : <><PlaneIcon />Criar Alerta de Preço</>}
            </button>
          </div>
        </form>

        {message && (
          <div className={`mt-6 p-3 rounded-xl text-center text-sm ${message.type === 'success' ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200' : 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200'}`}>
            {message.text}
          </div>
        )}

        {/* Estilos CSS personalizados para o DayPicker */}
        <style jsx global>{`
          .custom-daypicker {
            --rdp-cell-size: 36px;
            --rdp-accent-color: #0b60ff;
            --rdp-background-color: rgba(11, 96, 255, 0.12);
            --rdp-accent-color-dark: #3b82f6;
            --rdp-background-color-dark: rgba(59, 130, 246, 0.2);
          }

          .rdp-day_selected, 
          .rdp-day_selected:focus-visible, 
          .rdp-day_selected:hover {
            background-color: var(--rdp-accent-color) !important;
            color: white !important;
            font-weight: 600;
          }

          .rdp-day_range_start, 
          .rdp-day_range_end {
            background-color: var(--rdp-accent-color) !important;
            color: white !important;
            border-radius: 50% !important;
          }

          .rdp-day_range_middle {
            background-color: var(--rdp-background-color) !important;
            color: inherit !important;
          }

          .dark .rdp-day_range_middle {
            background-color: var(--rdp-background-color-dark) !important;
          }

          .rdp-button:hover:not([disabled]):not(.rdp-day_selected) {
            background-color: rgba(0, 0, 0, 0.1) !important;
          }

          .dark .rdp-button:hover:not([disabled]):not(.rdp-day_selected) {
            background-color: rgba(255, 255, 255, 0.1) !important;
          }

          .rdp-caption_label {
            font-weight: 600;
            color: inherit;
          }

          .rdp-head_cell {
            font-weight: 500;
            color: #6b7280;
          }

          .dark .rdp-head_cell {
            color: #9ca3af;
          }

          .rdp-nav_button {
            color: #6b7280;
          }

          .dark .rdp-nav_button {
            color: #9ca3af;
          }

          .rdp-nav_button:hover {
            background-color: rgba(0, 0, 0, 0.05) !important;
          }

          .dark .rdp-nav_button:hover {
            background-color: rgba(255, 255, 255, 0.05) !important;
          }
        `}</style>
      </div>
    </main>
  );
}