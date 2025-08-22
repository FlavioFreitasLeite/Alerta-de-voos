// Substitua o conteúdo do arquivo: app/api/create-alert/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Amadeus from 'amadeus';
import { Resend } from 'resend';
import { PriceMetric } from '@/app/types';
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

const formatDateForSkyscanner = (dateString: string) => {
  return dateString.substring(2).replace(/-/g, '');
};

// --- NOVO: Função para obter o contexto do preço ---
async function getPriceContext(origin: string, destination: string, departureDate: string, currentPrice: number, isOneWay: boolean): Promise<string> {
  try {
    const response = await amadeus.analytics.itineraryPriceMetrics.get({
      originIataCode: origin,
      destinationIataCode: destination,
      departureDate: departureDate,
      currencyCode: 'BRL',
      oneWay: isOneWay,
    });

    const metrics = (response as unknown as { data: { priceMetrics: PriceMetric[] }[] }).data[0]?.priceMetrics;
    if (!metrics) return '';

    const firstQuartile = parseFloat(metrics.find((m: PriceMetric) => m.quartileRanking === 'FIRST')?.amount || '0');
    const thirdQuartile = parseFloat(metrics.find((m: PriceMetric) => m.quartileRanking === 'THIRD')?.amount || '0');

    if (currentPrice <= firstQuartile) {
      return 'Este preço é considerado <strong>BAIXO</strong> para esta rota.';
    }
    if (currentPrice > firstQuartile && currentPrice <= thirdQuartile) {
      return 'Este preço está <strong>NA MÉDIA</strong> para esta rota.';
    }
    if (currentPrice > thirdQuartile) {
      return 'Este preço é considerado <strong>ALTO</strong> para esta rota.';
    }
    return '';
  } catch (error) {
    console.error("Erro ao buscar métricas de preço:", error);
    return '';
  }
}


export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      origin,
      destination,
      departureDate,
      returnDate,
      passengers,
      userEmail,
      shortDuration,
    } = body;

    if (!origin || !destination || !departureDate || !userEmail) {
      return NextResponse.json({ error: 'Dados incompletos.' }, { status: 400 });
    }

    const searchRequest = {
      currencyCode: 'BRL',
      originDestinations: [{
        id: '1',
        originLocationCode: origin,
        destinationLocationCode: destination,
        departureDateTimeRange: { date: departureDate },
      }],
      travelers: Array.from({ length: passengers }, (_, i) => ({
        id: (i + 1).toString(),
        travelerType: 'ADULT',
      })),
      sources: ['GDS'],
      searchCriteria: {
        maxFlightOffers: 1,
        flightFilters: {
          connectionRestriction: {
            maxNumberOfConnections: shortDuration ? 0 : undefined,
          },
        },
      },
    };

    if (returnDate) {
      searchRequest.originDestinations.push({
        id: '2',
        originLocationCode: destination,
        destinationLocationCode: origin,
        departureDateTimeRange: { date: returnDate },
      });
    }
    
    const flightResponse = await amadeus.shopping.flightOffersSearch.post(
      JSON.stringify(searchRequest)
    );

    const flightData = flightResponse.data[0];
    if (!flightData) {
      return NextResponse.json({ error: 'Nenhum voo encontrado para esta rota e data.' }, { status: 404 });
    }

    const initialPrice = parseFloat(flightData.price.total);
    console.log(`Preço inicial encontrado: R$ ${initialPrice}`);
    
    // --- NOVO: Busca o contexto do preço ---
    const priceContextMessage = await getPriceContext(origin, destination, departureDate, initialPrice, !returnDate);

    const formattedDepartureDate = formatDateForSkyscanner(departureDate);
    let purchaseLink = `https://www.skyscanner.com.br/transport/flights/${origin.toLowerCase()}/${destination.toLowerCase()}/${formattedDepartureDate}/`;
    if (returnDate) {
      const formattedReturnDate = formatDateForSkyscanner(returnDate);
      purchaseLink += `${formattedReturnDate}/`;
    }

    const { data, error: supabaseError } = await supabase
      .from('alerts')
      .insert([{
        user_email: userEmail,
        origin,
        destination,
        departure_date: departureDate,
        return_date: returnDate,
        passengers,
        last_price: initialPrice,
        purchase_link: purchaseLink,
        short_duration: shortDuration,
      }])
      .select();

    if (supabaseError) {
      throw new Error(`Erro no Supabase: ${supabaseError.message}`);
    }

    try {
      const formattedPrice = initialPrice.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      });

      await resend.emails.send({
        from: 'onboarding@resend.dev',
        to: userEmail,
        subject: `Seu Alerta de Voo foi Criado! (${origin} -> ${destination})`,
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6;">
            <h1>Alerta de Preço Ativado!</h1>
            <p>Olá!</p>
            <p>Confirmamos a criação do seu alerta para o voo de <strong>${origin}</strong> para <strong>${destination}</strong>.</p>
            <p>O preço atual que encontramos foi de <strong style="font-size: 1.2em;">${formattedPrice}</strong>.</p>
            ${priceContextMessage ? `<p style="background-color: #e8f0fe; padding: 10px; border-radius: 8px;">${priceContextMessage}</p>` : ''}
            <a href="${purchaseLink}" target="_blank" style="display: inline-block; padding: 12px 24px; margin: 20px 0; font-size: 16px; color: white; background-color: #00a698; text-decoration: none; border-radius: 8px;">
              Ver Oferta no Skyscanner
            </a>
            <br><br>
            <p>Boa viagem!</p>
            <p><em>Equipe Alerta de Voos</em></p>
          </div>
        `,
      });
    } catch (emailError) {
      console.error("Erro ao enviar o e-mail de confirmação:", emailError);
    }

    return NextResponse.json({
      message: 'Alerta criado com sucesso! Enviamos um e-mail de confirmação.',
      data: data,
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Ocorreu um erro desconhecido.';
    console.error('Erro na API /create-alert:', errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
