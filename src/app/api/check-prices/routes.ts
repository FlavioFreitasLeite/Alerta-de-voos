import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Amadeus from 'amadeus';
import { Resend } from 'resend';
import { Alert, FlightOffer } from '@/app/types';

// --- Inicializa os clientes ---
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const amadeus = new Amadeus({
  clientId: process.env.AMADEUS_API_KEY!,
  clientSecret: process.env.AMADEUS_API_SECRET!,
});

const resend = new Resend(process.env.RESEND_API_KEY);

// --- Função para buscar o preço atualizado de um voo ---
async function getUpdatedFlightPrice(alert: Alert): Promise<number | null> {
  try {
    const flightResponse = await amadeus.shopping.flightOffersSearch.get({
      originLocationCode: alert.origin,
      destinationLocationCode: alert.destination,
      departureDate: alert.departure_date,
      ...(alert.return_date && { returnDate: alert.return_date }),
      adults: alert.passengers,
      currencyCode: 'BRL',
      max: 1,
    });

    const flightData = (flightResponse as unknown as { data: FlightOffer[] }).data[0];
    return flightData ? parseFloat(flightData.price.total) : null;
  } catch (error) {
    console.error(`Erro ao buscar preço para ${alert.origin}->${alert.destination}:`, error);
    return null;
  }
}

// --- Função principal que o Cron Job da Vercel irá chamar ---
export async function GET() {
  // 1. Pega todos os alertas do banco de dados
  const { data: alerts, error: fetchError } = await supabase.from('alerts').select('*');

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!alerts || alerts.length === 0) {
    return NextResponse.json({ message: 'Nenhum alerta para verificar.' });
  }

  console.log(`Iniciando verificação para ${alerts.length} alerta(s)...`);
  const changes = [];

  // 2. Itera sobre cada alerta
  for (const alert of alerts) {
    const newPrice = await getUpdatedFlightPrice(alert);

    // Pula para o próximo se não encontrar um novo preço
    if (newPrice === null) {
      console.log(`Não foi possível encontrar novo preço para o alerta ID: ${alert.id}`);
      continue;
    }

    // Converte o last_price para número para garantir a comparação correta
    const lastPrice = Number(alert.last_price);

    // 3. Compara o preço antigo com o novo
    if (newPrice !== lastPrice) {
      console.log(`Mudança de preço detectada para o alerta ID: ${alert.id}. De ${lastPrice} para ${newPrice}`);
      
      // 4. Se mudou, envia o e-mail
      try {
        await resend.emails.send({
          from: 'onboarding@resend.dev', // IMPORTANTE: Para testes, use este e-mail.
          to: alert.user_email,
          subject: `ALERTA DE PREÇO: Voo ${alert.origin} ✈️ ${alert.destination}`,
          html: `
            <h1>O preço da sua viagem mudou!</h1>
            <p>Olá!</p>
            <p>O voo de <strong>${alert.origin}</strong> para <strong>${alert.destination}</strong> que você está monitorando mudou de preço.</p>
            <p>Preço anterior: <strong>R$ ${lastPrice.toFixed(2)}</strong></p>
            <p>Novo preço: <strong>R$ ${newPrice.toFixed(2)}</strong></p>
            <p>Aproveite para conferir!</p>
            <br>
            <p><em>Equipe Alerta de Voos</em></p>
          `,
        });

        // 5. Se o e-mail foi enviado, atualiza o preço no banco
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
