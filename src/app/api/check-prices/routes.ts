// Substitua o conteúdo do arquivo: app/api/check-prices/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import sgMail from '@sendgrid/mail'; // Alterado de Resend para SendGrid

// --- Tipos ---
interface Alert {
  id: string;
  user_email: string;
  origin: string;
  destination: string;
  departure_date: string;
  return_date: string | null;
  passengers: number;
  last_price: number;
  purchase_link: string;
  short_duration: boolean;
}

interface FlightOffer {
  price: number;
  [key: string]: any;
}

interface PriceInsights {
    lowest_price: number;
    price_level: string;
    typical_price_range: [number, number];
}

// --- Inicializa os clientes ---
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Configura o SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

// --- Função de busca usando SerpApi ---
async function getGoogleFlightsPrice(
    alert: Alert
): Promise<{ lowestPrice: number | null; priceInsights: PriceInsights | null }> {
    try {
        const params = new URLSearchParams({
            engine: 'google_flights',
            api_key: process.env.SERPAPI_KEY!,
            departure_id: alert.origin,
            arrival_id: alert.destination,
            outbound_date: alert.departure_date,
            adults: alert.passengers.toString(),
            currency: 'BRL',
            hl: 'pt-br',
            gl: 'br',
            stops: alert.short_duration ? '1' : '0',
            deep_search: 'true',
        });

        if (alert.return_date) {
            params.append('return_date', alert.return_date);
        }

        const response = await fetch(`https://serpapi.com/search?${params.toString()}`);
        if (!response.ok) {
            throw new Error(`SerpApi respondeu com o status: ${response.status}`);
        }

        const data = await response.json();
        const allFlights: FlightOffer[] = [...(data.best_flights || []), ...(data.other_flights || [])];

        if (allFlights.length === 0) {
            return { lowestPrice: null, priceInsights: null };
        }

        const lowestPrice = allFlights.reduce((min, flight) => 
            flight.price < min ? flight.price : min, 
            allFlights[0].price
        );

        return { lowestPrice, priceInsights: data.price_insights || null };

    } catch (error) {
        console.error("Erro na busca da SerpApi (Google Flights):", error);
        return { lowestPrice: null, priceInsights: null };
    }
}

export async function GET() {
  const { data: alerts, error: fetchError } = await supabase.from('alerts').select('*');

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!alerts || alerts.length === 0) {
    return NextResponse.json({ message: 'Nenhum alerta para verificar.' });
  }

  console.log(`Iniciando verificação para ${alerts.length} alerta(s)...`);
  const changes = [];

  for (const alert of alerts as Alert[]) {
    const { lowestPrice, priceInsights } = await getGoogleFlightsPrice(alert);

    if (lowestPrice === null) {
      console.log(`Não foi possível encontrar novo preço para o alerta ID: ${alert.id}`);
      continue;
    }

    const newPrice = lowestPrice;
    const lastPrice = Number(alert.last_price);

    if (newPrice !== lastPrice) {
      console.log(`Mudança de preço detectada para o alerta ID: ${alert.id}. De ${lastPrice} para ${newPrice}`);
      
      let priceContextMessage = '';
      if (priceInsights) {
          const level = priceInsights.price_level?.toLowerCase();
          const typicalRange = priceInsights.typical_price_range;
          if (level) {
              priceContextMessage = `Este novo preço é considerado <strong>${level.toUpperCase()}</strong> para esta rota (normalmente entre R$${typicalRange[0]} e R$${typicalRange[1]}).`;
          }
      }
      
      try {
        const formattedOldPrice = lastPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const formattedNewPrice = newPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

        // --- ATUALIZADO: Lógica de envio com SendGrid ---
        const msg = {
          to: alert.user_email,
          from: 'flaviofreitasleite@gmail.com', // IMPORTANTE: Use o seu e-mail verificado no SendGrid
          subject: `ALERTA DE PREÇO: Voo ${alert.origin} ✈️ ${alert.destination}`,
          html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.6;">
              <h1>O preço da sua viagem mudou!</h1>
              <p>Olá!</p>
              <p>O voo de <strong>${alert.origin}</strong> para <strong>${alert.destination}</strong> que você está monitorando mudou de preço.</p>
              <p>Preço anterior: <strong>${formattedOldPrice}</strong></p>
              <p>Novo preço: <strong style="font-size: 1.2em;">${formattedNewPrice}</strong></p>
              ${priceContextMessage ? `<p style="background-color: #e8f0fe; padding: 10px; border-radius: 8px;">${priceContextMessage}</p>` : ''}
              <a href="${alert.purchase_link}" target="_blank" style="display: inline-block; padding: 12px 24px; margin: 20px 0; font-size: 16px; color: white; background-color: #1a73e8; text-decoration: none; border-radius: 8px;">
                Ver Oferta no Google Flights
              </a>
              <br><br>
              <p>Aproveite para conferir!</p>
              <p><em>Equipe Alerta de Voos</em></p>
            </div>
          `,
        };

        await sgMail.send(msg);

        await supabase
          .from('alerts')
          .update({ last_price: newPrice })
          .eq('id', alert.id);
        
        changes.push({ id: alert.id, old: lastPrice, new: newPrice });

      } catch (emailError) {
        console.error(`Erro ao enviar e-mail para ${alert.user_email}:`, emailError);
      }
    } else {
      console.log(`Preço inalterado para o alerta ID: ${alert.id}. Preço: ${lastPrice}`);
    }
  }

  return NextResponse.json({
    message: `Verificação concluída. ${changes.length} preços alterados.`,
    changes,
  });
}
