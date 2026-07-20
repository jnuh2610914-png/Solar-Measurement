import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  MapPin,
  Sparkles,
  History,
  Trash2,
  Search,
  Sliders,
  BotMessageSquare,
  Lightbulb,
  Zap
} from "lucide-react";
import Markdown from "react-markdown";

function convertToGrid(lat: number, lng: number) {
  const RE = 6371.00877; 
  const GRID = 5.0; 
  const SLAT1 = 30.0; 
  const SLAT2 = 60.0; 
  const OLON = 126.0; 
  const OLAT = 38.0; 
  const XO = 43; 
  const YO = 136; 

  const DEGRAD = Math.PI / 180.0;
  const re = RE / GRID;
  const slat1 = SLAT1 * DEGRAD;
  const slat2 = SLAT2 * DEGRAD;
  const olon = OLON * DEGRAD;
  const olat = OLAT * DEGRAD;

  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = (re * sf) / Math.pow(ro, sn);
  
  let ra = Math.tan(Math.PI * 0.25 + lat * DEGRAD * 0.5);
  ra = (re * sf) / Math.pow(ra, sn);
  let theta = lng * DEGRAD - olon;
  if (theta > Math.PI) theta -= 2.0 * Math.PI;
  if (theta < -Math.PI) theta += 2.0 * Math.PI;
  theta *= sn;
  
  return {
    x: Math.floor(ra * Math.sin(theta) + XO + 0.5),
    y: Math.floor(ro - ra * Math.cos(theta) + YO + 0.5)
  };
}

interface HistoryItem {
  id: string;
  date: string;
  region: string;
  consumption: number;
  generation: number;
  ratio: number;
  analysis: string;
}

interface RegionPreset {
  name: string;
  radiation: number;
  desc: string;
}

const REGION_PRESETS: RegionPreset[] = [
  { name: "제주", radiation: 3.8, desc: "일사량이 풍부한 대한민국 청정에너지의 중심" },
  { name: "서울", radiation: 3.2, desc: "대도시 환경이지만 최근 아파트 미니태양광이 활발한 지역" },
  { name: "부산", radiation: 3.7, desc: "남해안의 따사로운 햇살을 머금은 해양 에너지 도시" },
  { name: "인천", radiation: 3.3, desc: "서해안 해풍과 어우러져 신재생 에너지가 도약하는 도시" },
  { name: "광주", radiation: 3.6, desc: "햇빛 도시라 불릴 만큼 일사량이 뛰어난 호남 거점" },
  { name: "대전", radiation: 3.4, desc: "대덕연구단지와 과학 연구가 어우러진 친환경 스마트 도시" },
  { name: "경기", radiation: 3.3, desc: "전력 소비량이 많아 태양광 자립이 절실히 필요한 수도권" },
  { name: "강원", radiation: 3.5, desc: "높은 고도와 맑은 공기로 높은 태양광 발전 효율을 자랑하는 곳" },
];

const detectRegionFromAddress = (addr: string): string => {
  if (addr.includes("제주")) return "제주";
  if (addr.includes("서울")) return "서울";
  if (addr.includes("부산")) return "부산";
  if (addr.includes("인천")) return "인천";
  if (addr.includes("광주")) return "광주";
  if (addr.includes("대전")) return "대전";
  if (addr.includes("경기")) return "경기";
  if (addr.includes("강원")) return "강원";
  return "제주";
};

const getSliderVal = (val: number): number => {
  if (val <= 360) return ((val - 50) / (360 - 50)) * 50;
  return 50 + ((val - 360) / (2000 - 360)) * 50;
};

const getConsumptionFromSlider = (s: number): number => {
  if (s <= 50) return Math.round(50 + (s / 50) * (360 - 50));
  return Math.round(360 + ((s - 50) / 50) * (2000 - 360));
};

export default function App() {
  const [region, setRegion] = useState<string>("제주");
  const [consumption, setConsumption] = useState<number>(360); 
  const [generation, setGeneration] = useState<number>(120); 

  const [sunshineHours, setSunshineHours] = useState<number>(3.8); 
  const [searchAddress, setSearchAddress] = useState<string>("");
  const [currentAddress, setCurrentAddress] = useState<string>("제주특별자치도 제주시 첨단로 242");

  const [loading, setLoading] = useState<boolean>(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState<boolean>(false);

  const [weatherLabel, setWeatherLabel] = useState<string>("조회 대기중 🌤️");

  const WEATHER_API_KEY = "••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••"; 

  const fetchLiveWeather = async (lat: number, lng: number) => {
    try {
      const grid = convertToGrid(lat, lng);
      const now = new Date();
      const baseDate = now.toISOString().slice(0, 10).replace(/-/g, "");
      
      const url = `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst?serviceKey=${encodeURIComponent(WEATHER_API_KEY)}&pageNo=1&numOfRows=50&dataType=JSON&base_date=${baseDate}&base_time=0500&nx=${grid.x}&ny=${grid.y}`;

      const res = await fetch(url);
      const data = await res.json();

      if (data.response?.header?.resultCode === "00") {
        const items = data.response.body.items.item;
        const skyItem = items.find((i: any) => i.category === "SKY");
        
        if (skyItem) {
          const skyVal = parseInt(skyItem.fcstValue); 
          const basePreset = REGION_PRESETS.find(p => p.name === region) || { radiation: 3.5 };
          
          if (skyVal === 1) {
            setWeatherLabel("맑음 ☀️");
            setSunshineHours(Math.round(basePreset.radiation * 1.2 * 10) / 10);
            triggerToast("기상청 데이터 반영: 맑음 ☀️");
          } else if (skyVal === 3) {
            setWeatherLabel("구름많음 ⛅");
            setSunshineHours(Math.round(basePreset.radiation * 0.7 * 10) / 10);
            triggerToast("기상청 데이터 반영: 구름많음 ⛅");
          } else {
            setWeatherLabel("흐림 ☁️");
            setSunshineHours(Math.round(basePreset.radiation * 0.3 * 10) / 10);
            triggerToast("기상청 데이터 반영: 흐림 ☁️");
          }
        }
      } else {
        throw new Error();
      }
    } catch (err) {
      const basePreset = REGION_PRESETS.find(p => p.name === region) || { radiation: 3.5 };
      setSunshineHours(basePreset.radiation);
      setWeatherLabel("기본 통계치 🌤️");
    }
  };

  // ⚡ 실시간 수치 자동 계산
  useEffect(() => {
    const monthlyGen = Math.round(3 * sunshineHours * 0.75 * 30);
    setGeneration(monthlyGen);
  }, [sunshineHours]);

  const handleAddressSearch = () => {
    if (!searchAddress.trim()) return;
    setCurrentAddress(searchAddress);
    const detected = detectRegionFromAddress(searchAddress);
    setRegion(detected);
    fetchLiveWeather(33.4996, 126.5312);
    triggerToast(`위치가 주소 기반으로 갱신되었습니다.`);
  };

  // ⚡ 0.01초 만에 실시간 계산되는 자립율 및 절감 금액
  const computedRatio = consumption > 0 ? Math.round((generation / consumption) * 1000) / 10 : 0;
  const savedMoney = Math.round(generation * 200); 

  const getStatusInfo = (ratio: number) => {
    if (ratio >= 100) return { label: "에너지 자립 영웅 🏆", color: "text-white bg-[#748E63] border-[#748E63]", chartColor: "#748E63", desc: "사용하는 전기를 뛰어넘어 친환경 에너지를 생산 중이에요!" };
    if (ratio >= 50) return { label: "우수 에너지 자립가 ⭐", color: "text-[#748E63] bg-[#F1F3E9] border-[#E2E6D5]", chartColor: "#8DA875", desc: "우리 집 절반 이상의 에너지를 태양광으로 자급자족하고 있습니다." };
    if (ratio >= 20) return { label: "새싹 자립가 🌤️", color: "text-[#5A5A40] bg-[#F7F8F2] border-[#D1D6BC]", chartColor: "#B5C18E", desc: "의미 있는 비율을 스스로 충당하며 가계와 환경을 살리고 있어요!" };
    return { label: "초보 자립가 🔌", color: "text-[#8A8D7C] bg-[#F7F8F2] border-[#E9EBE0]", chartColor: "#D1D6BC", desc: "시작이 절반! 에너지 사용 요령을 터득해 자립률을 높여보아요." };
  };

  const status = getStatusInfo(computedRatio);

  const triggerToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const getAiAdvice = (ratio: number, consumption: number) => {
    let adviceList = [];

    if (ratio < 30) {
      adviceList.push("💡 **발전 효율 개선**: 현재 자립도가 낮은 편입니다. 미니 태양광 패널 용량을 확충하거나 패널 각도를 남향 30~35도로 재조정해보세요.");
      adviceList.push("⚡ **피크 시간대 절전**: 낮 시간(11시~15시) 태양광 직접 발전 전력을 활용해 세탁기나 건조기를 돌리면 누진세를 크게 줄일 수 있습니다.");
    } else if (ratio < 70) {
      adviceList.push("🌱 **훌륭한 에너지 관리**: 전력 사용량의 상당 부분을 스스로 충당하고 계십니다! 대기전력 차단 콘센트만 추가해도 자립도를 5~10% 더 올릴 수 있습니다.");
      adviceList.push("☀️ **계절별 대응 전략**: 여름/겨울철 난방·냉방기 사용 시 태양광 피크 타임과 연동되는 스마트 플러그 도입을 추천합니다.");
    } else {
      adviceList.push("🏆 **완벽한 에너지 자립**: 완벽에 가까운 친환경 자립 상태입니다! Surplus(잉여) 전력이 발생할 경우 ESS(에너지저장장치) 도입이나 한전 이월을 고려해보세요.");
      adviceList.push("🔄 **지속가능한 관리**: 패널 표면의 먼지나 이물질을 주기적으로 닦아주는 것만으로도 연간 3~5%의 발전량을 추가 확보할 수 있습니다.");
    }

    if (consumption > 400) {
      adviceList.push("⚠️ **고소비 경고**: 월 소비량이 400kWh를 초과하여 전기요금 누진 구간에 진입했습니다. 고효율(1등급) 가전 교체를 적극 검토하세요.");
    }

    return adviceList;
  };

  // ⚡ 지연 시간 없이 AI 조언 리포트만 생성
  const handleAnalyze = () => {
    setLoading(true);
    setTimeout(() => {
      const aiAdvice = getAiAdvice(computedRatio, consumption);

      const analysisMarkdown = `## 🌱 ${region} 지역 실시간 에너지 자립 진단서

기상청 예보[\`${weatherLabel}\`] 연동 분석 결과입니다.

---

### 📊 종합 분석 스코어
* **월 평균 전기 사용량**: \`${consumption} kWh\`
* **태양광 자동 예측 발전량**: \`${generation} kWh\`
* **최종 에너지 자립도**: **${computedRatio}%** 🥳

---

### 🤖 AI 맞춤형 팩트 폭격 & 에너지 솔루션

${aiAdvice.map(tip => `* ${tip}`).join("\n\n")}

> 💡 **AI 종합 의견**: ${currentAddress}의 기상 조건과 소비 패턴을 고려할 때, 월 **${savedMoney.toLocaleString()}원**의 실질적 절감 효과가 발생합니다.`;

      setAnalysis(analysisMarkdown);
      
      const newItem: HistoryItem = {
        id: Date.now().toString(),
        date: new Date().toLocaleDateString(),
        region,
        consumption,
        generation,
        ratio: computedRatio,
        analysis: analysisMarkdown
      };
      setHistory(prev => [newItem, ...prev]);

      setLoading(false);
      triggerToast("AI 상세 조언 리포트 생성이 완료되었습니다! 🌱");
    }, 400); // 지연 시간을 0.4초로 최소화
  };

  const deleteHistoryItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setHistory(prev => prev.filter(item => item.id !== id));
    triggerToast("기록이 삭제되었습니다.");
  };

  // SVG 원형 파이 차트 계산용
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (Math.min(computedRatio, 100) / 100) * circumference;

  return (
    <div className="min-h-screen bg-[#F7F8F2] font-sans text-[#4A4A35] pb-12">
      <AnimatePresence>
        {toastMsg && (
          <motion.div initial={{ opacity: 0, y: -50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -50 }} className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-[#4A4A35] text-white px-6 py-3 rounded-full shadow-xl text-sm font-medium">
            {toastMsg}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-7xl mx-auto px-4 pt-6">
        <header className="bg-white border border-[#E9EBE0] rounded-[32px] p-6 shadow-sm mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-serif font-bold text-[#4A4A35]">Solar Measurement</h1>
            <p className="text-[#8A8D7C] text-sm mt-1.5">실시간 반응형 에너지 자립도 & AI 솔루션 진단 시스템</p>
          </div>
          <button onClick={() => setShowHistory(!showHistory)} className="flex items-center gap-2 bg-[#F1F3E9] border border-[#E2E6D5] hover:bg-[#E9EBE0] text-[#4A4A35] px-4 py-2.5 rounded-2xl text-sm font-bold transition-all shadow-sm">
            <History size={16} />
            {showHistory ? "대시보드 보기" : "기록 보관함"}
            {history.length > 0 && <span className="bg-[#748E63] text-white text-xs px-2 py-0.5 rounded-full ml-1">{history.length}</span>}
          </button>
        </header>

        {!showHistory ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* LEFT PANEL */}
            <section className="lg:col-span-5 space-y-6">
              <div className="bg-white rounded-[32px] p-6 shadow-sm border border-[#E9EBE0] flex flex-col gap-5">
                
                {/* 현재 위치 */}
                <div className="bg-[#F7F8F2] p-5 rounded-2xl border border-[#E9EBE0] text-sm">
                  <div className="flex items-center gap-2 text-[#748E63] font-bold mb-1.5">
                    <MapPin size={16} />
                    <span>현재 선택된 위치:</span>
                  </div>
                  <div className="font-extrabold text-base text-[#4A4A35] mb-2">{currentAddress}</div>
                  <p className="text-xs text-[#8A8D7C] leading-relaxed">
                    주소를 입력하시면 실시간 기상 일사량 데이터가 상단 수치에 즉시 연동됩니다.
                  </p>
                </div>

                {/* 주소 검색창 */}
                <div className="flex gap-2 relative">
                  <div className="relative flex-1">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8A8D7C]" />
                    <input
                      type="text"
                      value={searchAddress}
                      onChange={(e) => setSearchAddress(e.target.value)}
                      placeholder="예: 제주시 첨단로 242"
                      className="w-full pl-9 pr-4 py-3 text-sm bg-white border border-[#E9EBE0] rounded-xl focus:outline-none focus:border-[#748E63]"
                    />
                  </div>
                  <button onClick={handleAddressSearch} className="bg-[#4A4A35] hover:bg-[#3d3d2c] text-white px-5 py-3 rounded-xl text-sm font-bold shadow-sm transition-all">
                    검색
                  </button>
                </div>

                {/* 월 전력 소비량 설정 */}
                <div className="bg-white border border-[#E9EBE0] p-5 rounded-2xl flex flex-col gap-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold text-[#4A4A35] flex items-center gap-1.5">
                      <Sliders size={15} className="text-[#8A8D7C]" /> 월 전력 소비량 설정
                    </span>
                    <div className="flex items-center gap-1 bg-[#F7F8F2] px-3 py-1 rounded-lg border border-[#E9EBE0] shadow-inner focus-within:border-[#748E63] transition-all">
                      <input 
                        type="number" 
                        value={consumption}
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          setConsumption(isNaN(val) ? 0 : val);
                        }}
                        className="w-16 bg-transparent text-right font-extrabold text-sm text-[#4A4A35] focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <span className="text-xs font-bold text-[#8A8D7C]">kWh</span>
                    </div>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="100" 
                    value={getSliderVal(consumption)} 
                    onChange={(e) => setConsumption(getConsumptionFromSlider(parseInt(e.target.value)))} 
                    className="accent-[#748E63] cursor-pointer w-full h-1.5 bg-[#E9EBE0] rounded-lg appearance-none" 
                  />
                  <div className="flex justify-between text-[11px] text-[#8A8D7C]">
                    <span>50 kWh (최소)</span>
                    <span>360 kWh (평균)</span>
                    <span>2,000 kWh (최대)</span>
                  </div>
                </div>

                {/* AI 상세 분석 리포트 버튼 */}
                <button onClick={handleAnalyze} className="w-full bg-[#748E63] hover:bg-[#637d53] text-white py-4 rounded-2xl font-bold shadow-md text-base transition-all flex items-center justify-center gap-2">
                  <BotMessageSquare size={18} /> AI 상세 절감 리포트 생성하기
                </button>
              </div>
            </section>

            {/* RIGHT PANEL (⚡ 실시간 즉시 반응 영역) */}
            <section className="lg:col-span-7 space-y-6">
              <div className="space-y-6">
                {/* 📊 즉시 반응하는 원형 & 선형 실시간 차트 */}
                <div className="bg-white border border-[#E9EBE0] rounded-[32px] p-6 shadow-sm flex flex-col md:flex-row items-center gap-6">
                  <div className="relative w-36 h-36 flex-shrink-0 flex items-center justify-center">
                    <svg className="w-full h-full transform -rotate-90" viewBox="0 0 120 120">
                      <circle cx="60" cy="60" r={radius} stroke="#F1F3E9" strokeWidth="12" fill="transparent" />
                      <motion.circle
                        cx="60"
                        cy="60"
                        r={radius}
                        stroke={status.chartColor}
                        strokeWidth="12"
                        strokeDasharray={circumference}
                        animate={{ strokeDashoffset }}
                        transition={{ duration: 0.2, ease: "easeOut" }} // 애니메이션도 즉시 즉시 반응하도록 빠른 속도로 설정
                        strokeLinecap="round"
                        fill="transparent"
                      />
                    </svg>
                    <div className="absolute flex flex-col items-center justify-center text-center">
                      <span className="text-2xl font-black text-[#4A4A35]">{computedRatio}%</span>
                      <span className="text-[10px] font-bold text-[#8A8D7C]">자립율</span>
                    </div>
                  </div>

                  <div className="flex-1 w-full space-y-3">
                    <div className="flex justify-between text-xs font-bold">
                      <span className="flex items-center gap-1.5 text-[#748E63]"><Zap size={14} /> 태양광 자급자족 비율</span>
                      <span>{generation} kWh / {consumption} kWh</span>
                    </div>

                    <div className="w-full h-4 bg-[#F1F3E9] rounded-full overflow-hidden p-0.5 border border-[#E9EBE0]">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ backgroundColor: status.chartColor }}
                        animate={{ width: `${Math.min(computedRatio, 100)}%` }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                      />
                    </div>

                    <div className="flex justify-between items-center text-[11px] text-[#8A8D7C]">
                      <span>0% (전량 구매)</span>
                      <span>100% (완전 자립)</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-white border p-5 rounded-2xl shadow-sm"><span className="text-[11px] font-bold text-[#8A8D7C] block mb-1">월간 태양광 발전</span><span className="text-xl font-black">{generation} kWh</span></div>
                  <div className="bg-white border p-5 rounded-2xl shadow-sm"><span className="text-[11px] font-bold text-[#8A8D7C] block mb-1">에너지 자립도</span><span className="text-xl font-black text-[#748E63]">{computedRatio}%</span></div>
                  <div className="bg-white border p-5 rounded-2xl shadow-sm"><span className="text-[11px] font-bold text-[#8A8D7C] block mb-1">예상 절감 금액</span><span className="text-xl font-black">약 {savedMoney.toLocaleString()}원</span></div>
                </div>

                <div className={`p-5 rounded-2xl border ${status.color} shadow-sm transition-all duration-200`}>
                  <h4 className="text-base font-black">{status.label}</h4>
                  <p className="text-xs mt-1 leading-relaxed">{status.desc}</p>
                </div>

                {/* AI 리포트 출력 창 */}
                {loading ? (
                  <div className="bg-white border rounded-[32px] p-8 text-center flex flex-col items-center justify-center min-h-[160px] gap-3">
                    <div className="w-6 h-6 rounded-full border-2 border-t-[#748E63] animate-spin" />
                    <p className="text-xs font-semibold text-[#8A8D7C]">AI 솔루션 작성 중...</p>
                  </div>
                ) : analysis ? (
                  <div className="bg-white border rounded-[32px] p-6 shadow-sm prose text-sm text-[#5A5A40] leading-relaxed">
                    <Markdown>{analysis}</Markdown>
                  </div>
                ) : (
                  <div className="bg-white border rounded-[32px] p-6 text-center text-[#8A8D7C] text-sm flex flex-col items-center justify-center border-dashed gap-2">
                    <Lightbulb size={20} className="text-[#748E63]" />
                    <span className="text-xs">더 자세한 분석 팁이 필요하시면 **[AI 상세 절감 리포트 생성하기]**를 눌러주세요.</span>
                  </div>
                )}
              </div>
            </section>
          </div>
        ) : (
          /* 진단 기록 보관함 */
          <div className="bg-white border border-[#E9EBE0] rounded-[32px] p-6 shadow-sm min-h-[400px]">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-[#4A4A35]">
              <History size={20} className="text-[#748E63]" /> 진단 기록 보관함
            </h2>
            {history.length === 0 ? (
              <div className="text-center py-20 text-[#8A8D7C] text-sm">아직 저장된 진단 기록이 없습니다.</div>
            ) : (
              <div className="space-y-4">
                {history.map(item => (
                  <div key={item.id} onClick={() => { setAnalysis(item.analysis); setRegion(item.region); setConsumption(item.consumption); setGeneration(item.generation); setShowHistory(false); }} className="p-5 bg-[#F7F8F2] border border-[#E9EBE0] rounded-2xl cursor-pointer hover:border-[#748E63] transition-all flex justify-between items-center">
                    <div>
                      <div className="text-xs text-[#8A8D7C]">{item.date} • {item.region}</div>
                      <div className="font-bold text-base mt-1 text-[#4A4A35]">소비 {item.consumption}kWh / 발전 {item.generation}kWh</div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-lg font-black text-[#748E63]">{item.ratio}%</span>
                      <button onClick={(e) => deleteHistoryItem(item.id, e)} className="text-[#8A8D7C] hover:text-red-500 p-1 transition-colors">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
