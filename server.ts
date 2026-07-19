import express from "express";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

// Region and coordinates configuration for Kakao Map & Meteorological Admin (KMA) Forecast
const REGION_COORDS: { [key: string]: { nx: number, ny: number, lat: number, lng: number, fallbackTemp: number, fallbackSky: string, fallbackPty: string } } = {
  "제주": { nx: 52, ny: 38, lat: 33.4996, lng: 126.5312, fallbackTemp: 25, fallbackSky: "3", fallbackPty: "0" },
  "서울": { nx: 60, ny: 127, lat: 37.5665, lng: 126.9780, fallbackTemp: 24, fallbackSky: "1", fallbackPty: "0" },
  "부산": { nx: 98, ny: 76, lat: 35.1796, lng: 129.0756, fallbackTemp: 26, fallbackSky: "1", fallbackPty: "0" },
  "인천": { nx: 55, ny: 124, lat: 37.4563, lng: 126.7052, fallbackTemp: 23, fallbackSky: "4", fallbackPty: "0" },
  "광주": { nx: 58, ny: 74, lat: 35.1595, lng: 126.8526, fallbackTemp: 25, fallbackSky: "1", fallbackPty: "0" },
  "대전": { nx: 67, ny: 100, lat: 36.3504, lng: 127.3845, fallbackTemp: 24, fallbackSky: "3", fallbackPty: "0" },
  "경기": { nx: 60, ny: 120, lat: 37.2750, lng: 127.0090, fallbackTemp: 23, fallbackSky: "1", fallbackPty: "0" },
  "강원": { nx: 73, ny: 134, lat: 37.8859, lng: 127.7300, fallbackTemp: 21, fallbackSky: "4", fallbackPty: "1" }
};

// Helper function to return weather fallback
function returnWeatherFallback(coords: any, res: express.Response) {
  const result = parseWeatherData(coords.fallbackTemp, coords.fallbackSky, coords.fallbackPty, true);
  res.json(result);
}

// Helper function to parse weather data and compute solar multiplier
function parseWeatherData(temp: number, sky: string, pty: string, isFallback: boolean) {
  let skyLabel = "맑음";
  let skyIcon = "☀️";
  let radiationMultiplier = 1.2;

  const ptyVal = parseInt(pty) || 0;
  const skyVal = parseInt(sky) || 1;

  if (ptyVal > 0) {
    if (ptyVal === 1) {
      skyLabel = "비";
      skyIcon = "🌧️";
    } else if (ptyVal === 2) {
      skyLabel = "비/눈";
      skyIcon = "🌦️";
    } else if (ptyVal === 3) {
      skyLabel = "눈";
      skyIcon = "❄️";
    } else if (ptyVal === 4) {
      skyLabel = "소나기";
      skyIcon = "🌦️";
    }
    radiationMultiplier = 0.15; // Rain/Precipitation greatly degrades solar radiation
  } else {
    if (skyVal === 1) {
      skyLabel = "맑음";
      skyIcon = "☀️";
      radiationMultiplier = 1.2;
    } else if (skyVal === 3) {
      skyLabel = "구름많음";
      skyIcon = "⛅";
      radiationMultiplier = 0.8;
    } else if (skyVal === 4) {
      skyLabel = "흐림";
      skyIcon = "☁️";
      radiationMultiplier = 0.4;
    }
  }

  return {
    temp,
    sky,
    pty,
    skyLabel,
    skyIcon,
    radiationMultiplier,
    tempString: `${temp}°C`,
    isFallback
  };
}

// Helper function to compute KMA base date and time
function getKmaBaseDateTime() {
  const now = new Date();
  // KST is UTC + 9
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const kst = new Date(utc + (3600000 * 9));

  let year = kst.getFullYear();
  let month = kst.getMonth() + 1;
  let date = kst.getDate();
  let hours = kst.getHours();
  let minutes = kst.getMinutes();

  let baseHours = hours;
  // KMA Ultra Short-Term Forecast is released at 45 minutes of every hour.
  if (minutes < 45) {
    baseHours -= 1;
  }

  if (baseHours < 0) {
    const prevDate = new Date(kst.getTime() - 24 * 60 * 60 * 1000);
    year = prevDate.getFullYear();
    month = prevDate.getMonth() + 1;
    date = prevDate.getDate();
    baseHours = 23;
  }

  const base_date = `${year}${String(month).padStart(2, '0')}${String(date).padStart(2, '0')}`;
  const base_time = `${String(baseHours).padStart(2, '0')}30`;

  return { base_date, base_time };
}

// Config route to securely supply client-side keys like Kakao Maps
app.get("/api/config", (req, res) => {
  res.json({
    kakaoApiKey: process.env.KAKAO_MAP_KEY || "",
    hasGeminiKey: !!process.env.GEMINI_API_KEY
  });
});

// Weather Proxy route for Korea Meteorological Administration (KMA) Short-term Forecast
app.get("/api/weather", async (req, res) => {
  try {
    const regionName = (req.query.region as string) || "제주";
    const coords = REGION_COORDS[regionName];

    if (!coords) {
      return res.status(400).json({ error: "올바르지 않은 지역명입니다." });
    }

    const apiKey = process.env.WEATHER_API_KEY;
    if (!apiKey) {
      console.warn("WEATHER_API_KEY가 누설 방지를 위해 서버에 구성되지 않았거나 누락되었습니다. 폴백을 작동합니다.");
      return returnWeatherFallback(coords, res);
    }

    const { base_date, base_time } = getKmaBaseDateTime();
    
    // Dynamically detect and handle already URL-encoded vs raw service keys
    let serviceKey = apiKey.trim();
    if (!serviceKey.includes("%")) {
      serviceKey = encodeURIComponent(serviceKey);
    }

    const url = `http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtFcst?serviceKey=${serviceKey}&numOfRows=60&pageNo=1&dataType=JSON&base_date=${base_date}&base_time=${base_time}&nx=${coords.nx}&ny=${coords.ny}`;

    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) {
      console.log(`KMA API response status: ${response.status}. Activating local statistics fallback.`);
      return returnWeatherFallback(coords, res);
    }

    const data: any = await response.json();

    if (data?.response?.header?.resultCode !== "00") {
      console.warn(`KMA API returned error code ${data?.response?.header?.resultCode}. 로컬 폴백을 작동합니다.`);
      return returnWeatherFallback(coords, res);
    }

    const items = data?.response?.body?.items?.item;
    if (!items || !Array.isArray(items)) {
      console.warn("KMA API response empty/invalid items. 로컬 폴백을 작동합니다.");
      return returnWeatherFallback(coords, res);
    }

    let temp = String(coords.fallbackTemp);
    let sky = coords.fallbackSky;
    let pty = coords.fallbackPty;

    const tempItem = items.find((i: any) => i.category === "T1H");
    const skyItem = items.find((i: any) => i.category === "SKY");
    const ptyItem = items.find((i: any) => i.category === "PTY");

    if (tempItem) temp = tempItem.fcstValue;
    if (skyItem) sky = skyItem.fcstValue;
    if (ptyItem) pty = ptyItem.fcstValue;

    const result = parseWeatherData(parseFloat(temp), sky, pty, false);
    res.json(result);

  } catch (error: any) {
    console.error("KMA Weather API proxy error, returning fallback:", error);
    const regionName = (req.query.region as string) || "제주";
    const coords = REGION_COORDS[regionName] || REGION_COORDS["제주"];
    return returnWeatherFallback(coords, res);
  }
});

// API Route for AI analysis of solar energy independence
app.post("/api/analyze", async (req, res) => {
  try {
    const { region, consumption, generation, ratio } = req.body;

    if (!region || consumption === undefined || generation === undefined || ratio === undefined) {
      return res.status(400).json({ error: "필수 입력값이 누락되었습니다." });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Gemini API key가 설정되지 않았습니다. 관리자에게 문의하세요." });
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });

    // Calculate helper metrics on the server
    const savedMoney = Math.round(generation * 200); // 200 KRW per kWh
    const co2Reduction = (generation * 0.441).toFixed(1); // 0.441 kg CO2 per kWh
    const pineTrees = (parseFloat(co2Reduction) / 6.6).toFixed(1); // 1 pine tree absorbs 6.6 kg CO2 per year

    const prompt = `사용자 입력 데이터:
- 지역: ${region}
- 우리 집 총 전기 사용량: ${consumption} kWh
- 실제 태양광 발전량: ${generation} kWh
- 계산된 태양광 비중(에너지 자립도): ${ratio}%

계산된 보조 지표:
- 추정 전기요금 절감액: 약 ${savedMoney.toLocaleString()}원 (kWh당 200원 환산)
- 이산화탄소(CO2) 감축량: 약 ${co2Reduction} kg (kWh당 0.441kg 환산)
- 소나무 식재 효과: 약 ${pineTrees}그루 상당의 효과 (그루당 6.6kg 흡수 환산)`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        systemInstruction: `당신은 친환경 에너지 분석 자문관입니다. 사용자가 입력한 태양광 발전 데이터를 분석하여 친절하면서도 전문적인 피드백을 주어야 합니다.
이번 보고서는 **매우 직관적이고 핵심만 한눈에 들어오도록 짧게 요약된 형태**여야 합니다.

[답변 작성 및 스타일 규칙]
1. **짧고 핵심적인 요약**: 군더더기 서술을 완전히 배제하고, 전체 분량을 3~4개의 간결한 단락이나 카드형 요약으로 작성해 주세요. 친근한 어조와 핵심을 찌르는 이모티콘(🌱, ☀️, 👏)을 사용하되 설명은 담백하게 축약해야 합니다.
2. **중요 수치 글씨 키우기**: 핵심적인 수치 정보는 마크다운 소제목(## 또는 ###)이나 인용블록(> 인용문)으로 감싸서 시각적으로 글씨가 커지고 확실히 돋보이게 하세요.
3. **핵심 분석 내용**:
   - **에너지 자립도**: 전체 월 소비량(${consumption} kWh) 대비 자립율 **${ratio}%**를 강조하는 명확한 소제목을 적용하세요.
   - **경제적/환경적 성과**: 절감액(약 **${savedMoney.toLocaleString()}원**)과 탄소 감축 효과(**${co2Reduction} kg**, 소나무 **${pineTrees}그루**)를 큰 글씨 제목이나 리스트로 명료하게 구성하세요.
   - **실생활 액션 가이드**: 낮 시간(오전 11시 ~ 오후 3시) 가전 집중 사용 꿀팁을 단 한 줄의 핵심 한마디로 요약 정리해 주세요.
4. **가독성 극대화**: 마크다운 문법(##, ###, **, >)을 최대로 활용하여 모바일 화면에서도 스크롤 없이 요점만 파악할 수 있는 고밀도 레이아웃을 만드세요.`,
      }
    });

    res.json({ analysis: response.text });
  } catch (error: any) {
    console.error("AI Analysis error:", error);
    res.status(500).json({ error: error.message || "분석 도중 오류가 발생했습니다." });
  }
});

// Serve frontend client in non-serverless / non-Vercel environment
const isVercel = !!process.env.VERCEL;

if (!isVercel) {
  if (process.env.NODE_ENV !== "production") {
    // Dynamic import to avoid bundling Vite in production serverless builds
    import("vite").then(async ({ createServer: createViteServer }) => {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    }).catch(err => {
      console.error("Failed to load Vite server:", err);
    });
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const PORT = 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

export default app;
