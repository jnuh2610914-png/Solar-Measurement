import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Sun,
  Zap,
  Trees,
  MapPin,
  RotateCcw,
  Sparkles,
  History,
  ArrowRight,
  Info,
  Leaf,
  Landmark,
  ChevronRight,
  CheckCircle2,
  Trash2,
  Download,
  AlertCircle,
  Gauge,
  Search,
  Sliders
} from "lucide-react";
import Markdown from "react-markdown";

// Types for user history entries
interface HistoryItem {
  id: string;
  date: string;
  region: string;
  consumption: number;
  generation: number;
  ratio: number;
  analysis: string;
}

// Region preset definitions
interface RegionPreset {
  name: string;
  radiation: number; // Average solar radiation hours per day
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
  if (addr.includes("부산")) return "부산";
  if (addr.includes("인천")) return "인천";
  if (addr.includes("광주")) return "광주";
  if (addr.includes("대전")) return "대전";
  if (addr.includes("경기")) return "경기";
  if (addr.includes("강원")) return "강원";
  if (addr.includes("대구") || addr.includes("울산") || addr.includes("경북") || addr.includes("경남")) return "부산";
  if (addr.includes("충남") || addr.includes("충북") || addr.includes("세종")) return "대전";
  if (addr.includes("전남") || addr.includes("전북")) return "광주";
  return "서울"; // default fallback
};

// Map consumption value (50 to 2000) to raw slider value s (0 to 100)
const getSliderVal = (val: number): number => {
  if (val <= 360) {
    // map 50..360 to 0..50
    return ((val - 50) / (360 - 50)) * 50;
  } else {
    // map 360..2000 to 50..100
    return 50 + ((val - 360) / (2000 - 360)) * 50;
  }
};

// Map raw slider value s (0 to 100) to consumption value (50 to 2000)
const getConsumptionFromSlider = (s: number): number => {
  let val = 50;
  if (s <= 50) {
    val = 50 + (s / 50) * (360 - 50);
  } else {
    val = 360 + ((s - 50) / 50) * (2000 - 360);
  }
  return Math.round(val);
};

export default function App() {
  // Input states
  const [region, setRegion] = useState<string>("제주");
  const [consumption, setConsumption] = useState<number>(360); // Fixed average monthly consumption (12 kWh/day * 30 days)
  const [generation, setGeneration] = useState<number>(120); // Monthly solar generation in kWh, derived from sunshine hours
  const isSuppressRecalc = useRef(false);

  // Sunshine hours & Address states
  const [sunshineHours, setSunshineHours] = useState<number>(4.0); // Daily sunshine hours
  const [searchAddress, setSearchAddress] = useState<string>("");
  const [currentAddress, setCurrentAddress] = useState<string>("제주특별자치도 제주시 첨단로 242");

  // Manual overwrite state for calculated ratio
  const [isManualRatio, setIsManualRatio] = useState<boolean>(false);
  const [manualRatio, setManualRatio] = useState<number>(34.3);

  // App running states
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingStep, setLoadingStep] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Analysis result state
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  // Selected history item
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);

  // Regional coordinate definitions for Kakao Map
  const REGION_COORDS: { [key: string]: { lat: number; lng: number } } = {
    "제주": { lat: 33.4996, lng: 126.5312 },
    "서울": { lat: 37.5665, lng: 126.9780 },
    "부산": { lat: 35.1796, lng: 129.0756 },
    "인천": { lat: 37.4563, lng: 126.7052 },
    "광주": { lat: 35.1595, lng: 126.8526 },
    "대전": { lat: 36.3504, lng: 127.3845 },
    "경기": { lat: 37.2750, lng: 127.0090 },
    "강원": { lat: 37.8859, lng: 127.7300 }
  };

  // Weather and Map states
  const [weather, setWeather] = useState<{
    temp: number;
    sky: string;
    pty: string;
    skyLabel: string;
    skyIcon: string;
    radiationMultiplier: number;
    tempString: string;
    isFallback: boolean;
  } | null>(null);
  const [weatherLoading, setWeatherLoading] = useState<boolean>(false);
  const [mapError, setMapError] = useState<boolean>(false);
  const [hasGeminiKey, setHasGeminiKey] = useState<boolean>(true);

  // Fetch weather and update solar radiation/sunshineHours automatically when region changes
  useEffect(() => {
    let active = true;
    const fetchWeatherAndAutoCalculate = async () => {
      setWeatherLoading(true);
      try {
        const res = await fetch(`/api/weather?region=${encodeURIComponent(region)}`);
        if (!res.ok) throw new Error("Weather request failed");
        const data = await res.json();
        
        if (!active) return;
        setWeather(data);

        // Auto-calculate daily sunshine hours based on regional base solar radiation hours and real-time weather multiplier
        const basePreset = REGION_PRESETS.find(p => p.name === region);
        const baseRadiation = basePreset ? basePreset.radiation : 3.5;
        const weatherMultiplier = data.radiationMultiplier ?? 1.0;
        
        // Calculated daily sunshine hours (0.0 to 12.0)
        const calculatedSunshine = Math.min(12, Math.max(0, Math.round(baseRadiation * weatherMultiplier * 10) / 10));
        setSunshineHours(calculatedSunshine);
        
        if (data.isFallback) {
          triggerToast(`기본 기상 통계 정보가 적용되었습니다. 일조량: 하루 평균 ${calculatedSunshine}시간 🌤️`);
        } else {
          triggerToast(`기상청 실시간 예보 수신 성공! [${region}: ${data.skyIcon} ${data.skyLabel}, 기온 ${data.tempString}] 오늘 예상 일조 시간: ${calculatedSunshine}시간 ☀️`);
        }
      } catch (err) {
        console.error("Failed to fetch weather:", err);
        if (!active) return;
        // Local calculation fallback
        const basePreset = REGION_PRESETS.find(p => p.name === region);
        const baseRadiation = basePreset ? basePreset.radiation : 3.5;
        const calculatedSunshine = Math.round(baseRadiation * 1.0 * 10) / 10;
        setSunshineHours(calculatedSunshine);
        setWeather({
          temp: 22,
          sky: "1",
          pty: "0",
          skyLabel: "맑음 (기본값)",
          skyIcon: "☀️",
          radiationMultiplier: 1.0,
          tempString: "22°C",
          isFallback: true
        });
        triggerToast(`${region} 지역의 기본 기상 모델을 적용하여 일조 시간 ${calculatedSunshine}시간을 설정했습니다.`);
      } finally {
        if (active) setWeatherLoading(false);
      }
    };

    fetchWeatherAndAutoCalculate();
    return () => {
      active = false;
    };
  }, [region]);

  // Synchronize daily sunshineHours and static/dynamic values into generation/consumption for backend and UI metrics compatibility
  useEffect(() => {
    if (isSuppressRecalc.current) return;
    // 3kW capacity * sunshineHours * 30 days * 0.75 efficiency
    const monthlyGen = Math.round(3 * sunshineHours * 0.75 * 30);
    setGeneration(monthlyGen);
  }, [sunshineHours]);

  // Load Kakao Maps script and render map centered at selected region
  useEffect(() => {
    let isMounted = true;
    let mapInstance: any = null;

    const loadAndRenderMap = async () => {
      try {
        const configRes = await fetch("/api/config");
        if (!configRes.ok) throw new Error("Config request failed");
        const config = await configRes.json();
        
        if (isMounted) {
          setHasGeminiKey(!!config.hasGeminiKey);
        }
        
        const kakaoApiKey = "YOUR_KAKAO_JAVASCRIPT_KEY";
        const finalKey = kakaoApiKey !== "YOUR_KAKAO_JAVASCRIPT_KEY" && kakaoApiKey !== "" ? kakaoApiKey : config.kakaoApiKey;
        
        if (!finalKey) {
          console.warn("Kakao Map API Key is empty. Rendering fallback map.");
          setMapError(true);
          return;
        }

        // Helper to initialize map
        const initializeMap = () => {
          const container = document.getElementById("kakao-map");
          if (!container || !(window as any).kakao || !(window as any).kakao.maps) return;

          const coords = REGION_COORDS[region] || REGION_COORDS["제주"];
          
          (window as any).kakao.maps.load(() => {
            if (!isMounted) return;
            const options = {
              center: new (window as any).kakao.maps.LatLng(coords.lat, coords.lng),
              level: 8
            };
            
            // Clear prior map content if any
            container.innerHTML = "";
            mapInstance = new (window as any).kakao.maps.Map(container, options);

            // Add standard zoom & map type controls
            const zoomControl = new (window as any).kakao.maps.ZoomControl();
            mapInstance.addControl(zoomControl, (window as any).kakao.maps.ControlPosition.RIGHT);
            const mapTypeControl = new (window as any).kakao.maps.MapTypeControl();
            mapInstance.addControl(mapTypeControl, (window as any).kakao.maps.ControlPosition.TOPRIGHT);

            // Create center marker which is draggable
            const markerPosition = new (window as any).kakao.maps.LatLng(coords.lat, coords.lng);
            const marker = new (window as any).kakao.maps.Marker({
              position: markerPosition,
              draggable: true
            });
            marker.setMap(mapInstance);

            // Create custom info window showing current address
            const infowindow = new (window as any).kakao.maps.InfoWindow({
              content: `<div style="padding:8px 12px; font-size:12px; font-weight:bold; color:#4A4A35; font-family:sans-serif; text-align:center; min-width:180px;">
                태양광 진단 위치 ☀️
              </div>`
            });
            infowindow.open(mapInstance, marker);

            // Reverse geocoder logic to fetch address names on movement
            const updateAddressAndRegion = (lat: number, lng: number) => {
              if (!(window as any).kakao || !(window as any).kakao.maps || !(window as any).kakao.maps.services) return;
              const geocoder = new (window as any).kakao.maps.services.Geocoder();
              const latlng = new (window as any).kakao.maps.LatLng(lat, lng);
              
              geocoder.coord2Address(lng, lat, (result: any, status: any) => {
                if (status === (window as any).kakao.maps.services.Status.OK) {
                  const detailAddr = result[0].road_address ? result[0].road_address.address_name : result[0].address.address_name;
                  if (isMounted) {
                    setCurrentAddress(detailAddr);
                    setIsManualRatio(false);
                    const detected = detectRegionFromAddress(detailAddr);
                    if (detected !== region) {
                      setRegion(detected);
                    }
                    infowindow.setContent(`<div style="padding:8px 12px; font-size:12px; font-weight:bold; color:#4A4A35; font-family:sans-serif; text-align:center; max-width:200px;">
                      ${detailAddr}<br/><span style="color:#748E63; font-size:11px;">[태양광 분석 위치]</span>
                    </div>`);
                    infowindow.open(mapInstance, marker);
                  }
                }
              });
            };

            // Click listener on map to relocate marker and resolve address
            (window as any).kakao.maps.event.addListener(mapInstance, 'click', (mouseEvent: any) => {
              const latlng = mouseEvent.getLatLng();
              marker.setPosition(latlng);
              updateAddressAndRegion(latlng.getLat(), latlng.getLng());
            });

            // Dragend listener on marker to resolve address
            (window as any).kakao.maps.event.addListener(marker, 'dragend', () => {
              const latlng = marker.getPosition();
              updateAddressAndRegion(latlng.getLat(), latlng.getLng());
            });

            // Save references for the address search helper
            (window as any).currentMapInstance = mapInstance;
            (window as any).currentMapMarker = marker;
            (window as any).currentMapInfoWindow = infowindow;
            
            setMapError(false);
          });
        };

        // Check if script is already injected with services
        if ((window as any).kakao && (window as any).kakao.maps && (window as any).kakao.maps.services) {
          initializeMap();
        } else {
          const scriptId = "kakao-map-script";
          let script = document.getElementById(scriptId) as HTMLScriptElement;
          if (script) {
            script.remove(); // Remove to force loading with libraries=services
          }
          
          script = document.createElement("script");
          script.id = scriptId;
          script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${finalKey}&autoload=false&libraries=services`;
          script.async = true;
          document.head.appendChild(script);

          script.onload = () => {
            initializeMap();
          };
          
          script.onerror = () => {
            console.warn("Kakao Map script load failed. Using high-quality offline coordinates fallback.");
            if (isMounted) setMapError(true);
          };
        }

      } catch (err) {
        console.error("Error loading Kakao Map:", err);
        if (isMounted) setMapError(true);
      }
    };

    loadAndRenderMap();

    return () => {
      isMounted = false;
    };
  }, [region]);

  // Handler for searching address from the text search bar
  const handleAddressSearch = () => {
    if (!searchAddress.trim()) {
      triggerToast("검색할 주소를 입력해 주세요.");
      return;
    }
    
    if ((window as any).kakao && (window as any).kakao.maps && (window as any).kakao.maps.services) {
      const geocoder = new (window as any).kakao.maps.services.Geocoder();
      geocoder.addressSearch(searchAddress, (result: any, status: any) => {
        if (status === (window as any).kakao.maps.services.Status.OK) {
          const lat = parseFloat(result[0].y);
          const lng = parseFloat(result[0].x);
          const detailAddr = result[0].address_name;
          
          const mapInstance = (window as any).currentMapInstance;
          const marker = (window as any).currentMapMarker;
          const infowindow = (window as any).currentMapInfoWindow;
          
          if (mapInstance && marker) {
            const loc = new (window as any).kakao.maps.LatLng(lat, lng);
            mapInstance.setCenter(loc);
            marker.setPosition(loc);
            
            if (infowindow) {
              infowindow.setContent(`<div style="padding:8px 12px; font-size:12px; font-weight:bold; color:#4A4A35; font-family:sans-serif; text-align:center; max-width:200px;">
                ${detailAddr}<br/><span style="color:#748E63; font-size:11px;">[태양광 분석 위치]</span>
              </div>`);
              infowindow.open(mapInstance, marker);
            }
          }
          
          setCurrentAddress(detailAddr);
          setIsManualRatio(false);
          const detected = detectRegionFromAddress(detailAddr);
          if (detected !== region) {
            setRegion(detected);
          }
          triggerToast(`주소 검색 성공: ${detailAddr}`);
        } else {
          triggerToast("검색된 주소가 없습니다. 정확한 상세 주소를 입력해 주세요.");
        }
      });
    } else {
      // Offline fallback
      const detected = detectRegionFromAddress(searchAddress);
      setRegion(detected);
      setCurrentAddress(searchAddress);
      setIsManualRatio(false);
      triggerToast(`[오프라인 모드] 입력하신 주소(${searchAddress})를 기반으로 ${detected} 기상 통계를 매칭합니다.`);
    }
  };

  // Loading micro-messages
  const loadingMessages = [
    "태양광 발전에 알맞은 날씨와 지역적 특성을 AI가 분석하고 있습니다... ☀️",
    "이산화탄소 감축량과 소나무 식목 환산 효과를 꼼꼼히 확인하고 있어요... 🌱",
    "이 가정이 얻고 있는 경제적 혜택과 절감 효과를 종합적으로 산정 중입니다... 💰",
    "앞으로 자립도를 200% 더 끌어올릴 수 있는 실생활 실천 꿀팁을 작성하고 있어요... 💡",
  ];

  // Auto-calculated ratio based on consumption and generation
  const computedRatio = consumption > 0 
    ? Math.round((generation / consumption) * 1000) / 10 
    : 0;

  const activeRatio = isManualRatio ? manualRatio : computedRatio;

  // Derived environmental & economic metrics
  const savedMoney = Math.round(generation * 200); // Approximate 200 KRW per kWh saved
  const co2Reduction = (generation * 0.441).toFixed(1); // 0.441 kg CO2 reduction per kWh
  const pineTrees = (parseFloat(co2Reduction) / 6.6).toFixed(1); // 1 pine tree absorbs 6.6 kg CO2 per year

  // Grid/Utility purchase amount
  const gridPurchase = Math.max(0, consumption - generation);
  const surplusPower = Math.max(0, generation - consumption);

  // Dynamic self-sufficiency status label
  const getStatusInfo = (ratio: number) => {
    if (ratio >= 100) {
      return { label: "에너지 자립 영웅 🏆", color: "text-white bg-[#748E63] border-[#748E63]", desc: "사용하는 전기를 뛰어넘어 친환경 에너지를 생산 중이에요!" };
    } else if (ratio >= 50) {
      return { label: "우수 에너지 자립가 ⭐", color: "text-[#748E63] bg-[#F1F3E9] border-[#E2E6D5]", desc: "우리 집 절반 이상의 에너지를 태양광으로 자급자족하고 있습니다." };
    } else if (ratio >= 20) {
      return { label: "새싹 자립가 🌤️", color: "text-[#5A5A40] bg-[#F7F8F2] border-[#D1D6BC]", desc: "의미 있는 비율을 스스로 충당하며 가계와 환경을 살리고 있어요!" };
    } else {
      return { label: "초보 자립가 🔌", color: "text-[#8A8D7C] bg-[#F7F8F2] border-[#E9EBE0]", desc: "시작이 절반! 에너지 사용 요령을 터득해 자립률을 높여보아요." };
    }
  };

  const status = getStatusInfo(activeRatio);

  // Initialize and load history from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("solar_independence_history");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setHistory(parsed);
      } catch (e) {
        console.error("Failed to parse history", e);
      }
    } else {
      // Pre-populate with a cool default history item to showcase the interface on first load
      const defaultItem: HistoryItem = {
        id: "default-jeju",
        date: "2026-07-18",
        region: "제주",
        consumption: 380,
        generation: 160,
        ratio: 42.1,
        analysis: `## 🌱 제주 푸른 바다 가정을 위한 태양광 자립 정밀 분석 결과

안녕하세요! 제주 푸른 바다의 햇빛과 바람 아래에서 태양광 에너지를 멋지게 실천하고 계시는 가정의 에너지 자립도를 분석해 드립니다. 고등학교 과학 탐구 과제로 개발된 이 프로젝트를 활용해 주셔서 진심으로 고맙습니다! ☀️

---

### 📊 우리 집 에너지 자립도 성적표
* **우리 집 전체 전기 사용량**: \`380 kWh\`
* **실제 태양광 발전량**: \`160 kWh\`
* **에너지 자립도**: **42.1%** 👏

> **"우리 집 전체 전기 사용량 중 무려 42.1%를 지붕 위 친환경 태양광 발전기로 직접 해결하셨습니다!"**  
생산량이 매우 훌륭하여 한달 전기 고지서의 부담을 획기적으로 덜어내셨군요. 아주 자랑스러운 결과입니다!

---

### 💰 지갑을 지키는 경제적 이득 (한 달 환산)
- **추정 전기요금 절감액**: **약 32,000원** 💸
  - 태양광으로 자급자족한 160 kWh 덕분에 한국전력에서 구매해야 할 전력량이 줄어들었습니다. 특히 한국전력의 주택용 누진제 가중 단계에 걸리기 전에 누진세 부담을 막아내는 훌륭한 방패 역할을 톡톡히 해내고 있습니다!

---

### 🌳 지구를 살리는 초록빛 지구 지킴이 효과
- **이산화탄소(CO2) 감축량**: **약 70.6 kg** 🌱
- **소나무 식재 환산**: **약 10.7그루**를 한 해 동안 정성껏 심고 가꾼 것과 다름없는 가치를 만들어냈습니다.
  - 석탄이나 가스 발전 대신 깨끗한 햇빛으로 전기를 구동하여 제주의 아름다운 숲과 생태계를 보존하는 데 큰 보탬이 되셨습니다. 소나무 10그루가 우리 집 마당에서 매일 공기를 정화해 주는 행복한 상상을 해보세요!

---

### 💡 실생활 100% 활용도 극대화 꿀팁!
태양광 발전은 전력망으로 도로 흘려보내는 송전 손실이나 배터리 충·방전 손실 없이 **'생산하는 즉시 우리 집에서 직소비'**할 때 가장 이득이 큽니다!
1. **오전 11시 ~ 오후 3시 예약 세탁**: 빨래, 식기세척기, 그리고 건조기는 예약 모드를 활용해 해가 쨍쨍한 낮 시간에 집중 가동해 보세요.
2. **모바일/배터리 충전 데이**: 보조배터리나 로봇청소기는 해가 뜬 시간 동안 가득 채워두면 밤 시간 대의 외부 구입 전력 소모를 차단할 수 있습니다.

앞으로도 푸른 하늘과 미래를 지키는 태양광 전력 자립에 계속 함께해 주세요! 감사합니다. ✨`
      };
      setHistory([defaultItem]);
      localStorage.setItem("solar_independence_history", JSON.stringify([defaultItem]));
    }
  }, []);

  // Update loading step sequence with timer
  useEffect(() => {
    let interval: any;
    if (loading) {
      interval = setInterval(() => {
        setLoadingStep((prev) => (prev < loadingMessages.length - 1 ? prev + 1 : prev));
      }, 2500);
    } else {
      setLoadingStep(0);
    }
    return () => clearInterval(interval);
  }, [loading]);

  // Show inline toast message
  const triggerToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg(null);
    }, 3000);
  };

  // Trigger Gemini AI Expert analysis
  const handleAnalyze = async () => {
    setLoading(true);
    setErrorMsg(null);
    setAnalysis(null);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          region,
          consumption,
          generation,
          ratio: activeRatio,
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "분석을 처리하는 과정에서 서버 오류가 발생했습니다.");
      }

      const data = await response.json();
      setAnalysis(data.analysis);

      // Save to history
      const newItem: HistoryItem = {
        id: "analysis-" + Date.now(),
        date: new Date().toLocaleDateString("ko-KR"),
        region,
        consumption,
        generation,
        ratio: activeRatio,
        analysis: data.analysis,
      };

      const updatedHistory = [newItem, ...history.filter(h => h.id !== "default-jeju")];
      setHistory(updatedHistory);
      localStorage.setItem("solar_independence_history", JSON.stringify(updatedHistory));
      setSelectedHistoryId(newItem.id);
      triggerToast("AI 전문가의 자립도 정밀 진단서가 보관함에 저장되었습니다! 🌱");
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "네트워크 문제로 분석 요청에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  };

  // Load an item from history
  const handleLoadHistory = (item: HistoryItem) => {
    isSuppressRecalc.current = true;
    setRegion(item.region);
    setConsumption(item.consumption);
    setGeneration(item.generation);
    
    // Back-calculate sunshineHours: generation / (3 * 0.75 * 30)
    const hours = Math.round((item.generation / (3 * 0.75 * 30)) * 10) / 10;
    setSunshineHours(hours || 4.0);

    if (item.ratio !== Math.round((item.generation / item.consumption) * 1000) / 10) {
      setIsManualRatio(true);
      setManualRatio(item.ratio);
    } else {
      setIsManualRatio(false);
    }
    setAnalysis(item.analysis);
    setSelectedHistoryId(item.id);
    setErrorMsg(null);
    triggerToast(`${item.date}에 저장된 전력 분석을 불러왔습니다! 🏡`);

    setTimeout(() => {
      isSuppressRecalc.current = false;
    }, 100);
  };

  // Delete a history item
  const handleDeleteHistory = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = history.filter((item) => item.id !== id);
    setHistory(updated);
    localStorage.setItem("solar_independence_history", JSON.stringify(updated));
    if (selectedHistoryId === id) {
      setSelectedHistoryId(null);
      setAnalysis(null);
    }
    triggerToast("분석 내역이 보관함에서 삭제되었습니다.");
  };

  // Reset to default presets
  const handleReset = () => {
    setRegion("제주");
    setConsumption(360);
    setSunshineHours(4.0);
    setCurrentAddress("제주특별자치도 제주시 첨단로 242");
    setSearchAddress("");
    setIsManualRatio(false);
    setAnalysis(null);
    setSelectedHistoryId(null);
    setErrorMsg(null);
    triggerToast("데이터가 표준 기본값으로 초기화되었습니다! ♻️");
  };

  // Export current screen analysis as simple plain text
  const handleExportText = () => {
    if (!analysis) return;
    const element = document.createElement("a");
    const file = new Blob([analysis], { type: "text/plain;charset=utf-8" });
    element.href = URL.createObjectURL(file);
    element.download = `우리집_태양광_자립도_진단서_${region}_${activeRatio}퍼센트.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    triggerToast("진단서 파일(.txt)이 기기에 저장되었습니다!");
  };

  // Preset custom numbers for easier data adjustments
  const handleQuickSunshine = (hours: number) => {
    setSunshineHours(hours);
    triggerToast(`오늘의 일조량을 ${hours}시간으로 설정했습니다.`);
  };

  return (
    <div className="min-h-screen bg-[#F7F8F2] font-sans text-[#4A4A35] selection:bg-[#E2E6D5] selection:text-[#4A4A35] pb-12">
      {/* Toast Notification */}
      <AnimatePresence>
        {toastMsg && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-[#4A4A35] text-white px-6 py-3 rounded-full shadow-xl flex items-center gap-2 text-sm font-medium border border-[#5A5A40]"
            id="toast-notification"
          >
            <CheckCircle2 className="w-4 h-4 text-[#E2E6D5]" />
            <span>{toastMsg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        
        {/* Banner/Header */}
        <header className="bg-white border border-[#E9EBE0] rounded-[32px] p-6 sm:p-8 text-[#4A4A35] shadow-sm mb-8 relative overflow-hidden" id="main-header">
          {/* Subtle Decorative Elements */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-[#748E63]/5 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-10 left-1/3 w-80 h-80 bg-[#E2E6D5]/10 rounded-full blur-3xl pointer-events-none" />
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
            <div>
              <h1 className="text-2xl sm:text-3.5xl font-serif font-bold text-[#4A4A35]" id="app-title">
                Solar Measurement
              </h1>
              <p className="text-[#8A8D7C] text-sm mt-1.5 max-w-2xl leading-relaxed">
                지도의 주소와 그날의 일조량을 바탕으로 가정이 전력을 스스로 청정하게 해결할 수 있는 에너지 자립률을 스마트하게 계산합니다. 지도 위 주소를 검색하거나 클릭하고, 일조 시간을 조절해 보세요.
              </p>
            </div>
            
            <div className="flex items-center gap-3 self-start md:self-center">
              <button
                onClick={handleReset}
                className="bg-[#748E63] hover:bg-[#637d53] text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 border border-[#748E63] cursor-pointer shadow-sm"
                title="데이터 초기화"
                id="reset-button"
              >
                <RotateCcw className="w-4 h-4" />
                <span>기본값 초기화</span>
              </button>
            </div>
          </div>
        </header>

        {/* Dynamic Warning Alert if API key is missing */}
        {!hasGeminiKey && (
          <div className="bg-[#FDF6E9] border border-[#F2E0C9] rounded-2xl p-4 text-[#C28135] text-sm flex items-start gap-3 mb-6" id="api-key-warning">
            <AlertCircle className="w-5 h-5 text-[#C28135] shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-[#A68A5E]">AI 서비스 구동 준비 필요</p>
              <p className="text-[#A68A5E]/90 mt-1">
                현재 API Key가 준비 대기 상태이거나 로컬 샌드박스에서 연동 설정 중일 수 있습니다. 우측 상단의 <b>Settings &gt; Secrets</b> 탭에서 <code>GEMINI_API_KEY</code>를 입력해 주세요.
              </p>
            </div>
          </div>
        )}

        {/* Bento Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8" id="bento-grid">
          
          {/* LEFT: Data input Panel (5 Cols) */}
          {/* LEFT: Data input Panel (5 Cols) */}
          <section className="lg:col-span-5 space-y-6" id="input-section">
            <div className="bg-white rounded-[32px] p-6 shadow-sm border border-[#E9EBE0] flex flex-col gap-5 animate-fade-in" id="input-card">
              
              {/* Header */}
              <div className="flex items-center justify-between border-b border-[#E9EBE0] pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-[#F1F3E9] rounded-xl text-[#748E63]">
                    <MapPin className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="font-serif font-bold text-[#4A4A35] text-base">실시간 기상 관측 및 카카오 지역 지도</h3>
                    <p className="text-xs text-[#8A8D7C]">기상청 단기예보 및 카카오맵 연동 분석 시스템</p>
                  </div>
                </div>

                {weatherLoading ? (
                  <span className="text-xs bg-[#F7F8F2] border border-[#E9EBE0] text-[#8A8D7C] px-2.5 py-1 rounded-full animate-pulse flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#C28135] animate-ping" />
                    기상 수신 중...
                  </span>
                ) : weather && (
                  <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border flex items-center gap-1.5 ${
                    weather.isFallback 
                      ? "bg-[#FDF6E9] text-[#A68A5E] border-[#F2E0C9]" 
                      : "bg-[#F1F3E9] text-[#748E63] border-[#E2E6D5]"
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${weather.isFallback ? "bg-[#C28135]" : "bg-[#748E63] animate-pulse"}`} />
                    {weather.isFallback ? "기본 통계" : "실시간 예보 연동"}
                  </span>
                )}
              </div>

              {/* Kakao Map element */}
              <div className="h-64 rounded-2xl border border-[#E9EBE0] overflow-hidden relative shadow-sm" id="map-wrap">
                <div id="kakao-map" className="w-full h-full min-h-[240px]"></div>

                {mapError && (
                  <div className="absolute inset-0 bg-[#FDF6E9]/95 flex flex-col items-center justify-center p-4 text-center gap-2.5 z-10 border border-[#F2E0C9] rounded-2xl" id="map-fallback-overlay">
                    <div className="p-2.5 bg-amber-50 text-[#C28135] rounded-full animate-pulse border border-[#F2E0C9]">
                      <MapPin className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="text-xs font-extrabold text-[#8C6D3F] mb-1">카카오맵 키 인증 대기</h4>
                      <p className="text-[10px] text-[#9A815E] leading-relaxed max-w-[240px]">
                        KAKAO_MAP_KEY 환경 변수가 등록되었으나, 카카오 개발자 플랫폼에서 <b>도메인(SDK 허가 주소)</b> 등록이 필요할 수 있습니다.
                      </p>
                    </div>
                    <div className="text-[9px] text-[#A68A5E]/80 bg-white/50 border border-[#F2E0C9] px-2 py-1 rounded-md">
                      지역 좌표: 위도 {REGION_COORDS[region]?.lat || "33.5"}, 경도 {REGION_COORDS[region]?.lng || "126.5"}
                    </div>
                  </div>
                )}
              </div>

              {/* Selected Address Display card */}
              <div className="bg-[#F7F8F2] p-3 rounded-xl border border-[#D8DBCE] text-xs leading-relaxed flex items-start gap-1.5">
                <MapPin className="w-4 h-4 text-[#C28135] shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-[#8A8D7C]">📍 현재 선택된 위치:</span>
                  <p className="font-bold text-[#4A4A35] mt-0.5 break-all">{currentAddress}</p>
                  <p className="text-[10px] text-[#8A8D7C] mt-1">
                    지도를 마우스로 직접 클릭하거나 핀을 드래그하여 상세 주소 및 실시간 기상 데이터를 자동으로 갱신할 수 있습니다!
                  </p>
                </div>
              </div>

              {/* Household Power Consumption Input Section */}
              <div className="bg-[#F7F8F2] border border-[#E9EBE0] p-4 rounded-2xl flex flex-col gap-3" id="household-consumption-card">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-extrabold text-[#4A4A35] flex items-center gap-1.5" htmlFor="consumption-input">
                    <Zap className="w-4 h-4 text-[#C28135] animate-pulse" /> 우리 집 총 전력 사용량 (월 기준)
                  </label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      id="consumption-input"
                      value={consumption}
                      min="50"
                      max="2000"
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 0;
                        setConsumption(Math.min(2000, Math.max(1, val)));
                        setIsManualRatio(false);
                      }}
                      className="w-20 text-right font-extrabold text-[#4A4A35] border border-[#D1D6BC] rounded-lg px-2 py-0.5 text-xs bg-white focus:outline-none focus:border-[#748E63] focus:ring-1 focus:ring-[#748E63]"
                    />
                    <span className="text-xs font-bold text-[#8A8D7C]">kWh</span>
                  </div>
                </div>

                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={getSliderVal(consumption)}
                  onChange={(e) => {
                    const rawVal = parseFloat(e.target.value);
                    setConsumption(getConsumptionFromSlider(rawVal));
                    setIsManualRatio(false);
                  }}
                  className="w-full h-1.5 bg-[#E2E6D5] rounded-lg appearance-none cursor-pointer accent-[#748E63]"
                  id="consumption-slider"
                />

                <div className="flex justify-between text-[10px] text-[#8A8D7C] px-1 font-semibold">
                  <span>미니멀 (50 kWh)</span>
                  <span>평균 (360 kWh)</span>
                  <span>대용량 (2000 kWh)</span>
                </div>

                {/* Quick Presets */}
                <div className="flex gap-1.5 mt-1">
                  {[150, 360, 550].map((preset) => {
                    let label = "";
                    if (preset === 150) label = "🏢 1인 가구 (150k)";
                    if (preset === 360) label = "🏡 평균 (360k)";
                    if (preset === 550) label = "🏰 대가족 (550k)";
                    return (
                      <button
                        key={preset}
                        onClick={() => {
                          setConsumption(preset);
                          setIsManualRatio(false);
                          triggerToast(`월 권장 전력 소비량 ${preset}kWh로 설정했습니다.`);
                        }}
                        className={`text-[10px] font-bold px-2 py-1 rounded-lg border transition-all cursor-pointer ${
                          consumption === preset
                            ? "bg-[#748E63] text-white border-[#748E63] shadow-xs"
                            : "bg-white hover:bg-[#F1F3E9] text-[#5A5A40] border-[#D8DBCE]"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Weather observation display */}
              <div className="bg-[#F7F8F2] border border-[#E9EBE0] p-4 rounded-2xl flex flex-col justify-between gap-3" id="weather-obs-box">
                <div className="space-y-1">
                  <div className="text-[11px] text-[#8A8D7C] font-semibold uppercase tracking-wider">현재 기상 상황</div>
                  <div className="flex items-center gap-3">
                    <span className="text-4xl" role="img" aria-label="weather-icon">{weather?.skyIcon || "☀️"}</span>
                    <div>
                      <div className="text-xl font-black text-[#4A4A35]">
                        {region} {weather?.skyLabel || "맑음"}
                      </div>
                      <div className="text-xs font-semibold text-[#8A8D7C]">
                        현재 기온: <span className="text-[#748E63] text-sm font-black">{weather?.tempString || "24°C"}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-t border-[#E9EBE0]/60 my-1"></div>

                <div className="space-y-2">
                  <div className="text-[11px] text-[#8A8D7C] font-semibold">☀️ 태양광 발전 기여 인자</div>
                  
                  <div className="flex items-center justify-between text-xs bg-white p-2 rounded-xl border border-[#E9EBE0]/60">
                    <span className="text-[#5A5A40]">일조 보정 계수</span>
                    <span className="font-extrabold text-[#748E63]">{weather?.radiationMultiplier ? `${weather.radiationMultiplier}배` : "1.0배"}</span>
                  </div>

                  <p className="text-[10px] text-[#8A8D7C] leading-normal bg-white/40 p-2 rounded-lg border border-[#E9EBE0]/30">
                    {weather?.radiationMultiplier && weather.radiationMultiplier > 1.0 ? (
                      <span>✨ 오늘 하늘이 아주 맑아 <b>평년보다 발전 생산 효율이 대폭 늘어납니다!</b></span>
                    ) : weather?.radiationMultiplier && weather.radiationMultiplier < 0.6 ? (
                      <span>🌧️ 구름량 증가로 발전 효율이 다소 하락할 수 있습니다.</span>
                    ) : (
                      <span>⛅ 안정적이고 고른 에너지를 수확하는 기상 조건입니다.</span>
                    )}
                  </p>
                </div>
              </div>

            </div>
            <div className="bg-white rounded-[32px] p-6 shadow-sm border border-[#E9EBE0]" id="history-card">
              <h3 className="font-bold text-[#4A4A35] text-base mb-4 flex items-center gap-2 border-b border-[#E9EBE0] pb-3">
                <History className="w-5 h-5 text-[#8A8D7C]" />
                <span>분석 보관소 (로컬 저장)</span>
                <span className="bg-[#E2E6D5] text-[#5A5A40] border border-[#D1D6BC] font-bold text-xs px-2 py-0.5 rounded-full">
                  {history.length}
                </span>
              </h3>
              
              {history.length === 0 ? (
                <p className="text-xs text-[#8A8D7C] text-center py-6 leading-relaxed">
                  이전 분석 기록이 존재하지 않습니다.<br />위 양식을 작성하고 AI 전문가 진단을 진행해 보세요.
                </p>
              ) : (
                <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                  {history.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => handleLoadHistory(item)}
                      className={`group p-3 rounded-xl border text-left transition-all cursor-pointer flex justify-between items-center ${
                        selectedHistoryId === item.id
                          ? "bg-[#FDF6E9] border-[#F2E0C9] shadow-sm"
                          : "bg-[#F7F8F2] border-[#E9EBE0] hover:bg-[#F1F3E9]"
                      }`}
                      id={`history-item-${item.id}`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-[#4A4A35] bg-white border border-[#D8DBCE] px-1.5 py-0.5 rounded-md">
                            {item.region}
                          </span>
                          <span className="text-[11px] text-[#8A8D7C] font-semibold">{item.date}</span>
                        </div>
                        <div className="text-xs text-[#5A5A48]">
                          자립도 <span className="font-extrabold text-[#748E63]">{item.ratio}%</span> 
                          <span className="mx-1.5 text-[#D8DBCE]">|</span> 
                          발전 {item.generation}kWh
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <ArrowRight className="w-4 h-4 text-[#8A8D7C] group-hover:translate-x-1 transition-all" />
                        <button
                          onClick={(e) => handleDeleteHistory(item.id, e)}
                          className="p-1.5 hover:bg-rose-50 rounded-lg text-[#8A8D7C] hover:text-rose-600 transition-all cursor-pointer"
                          title="분석 결과 삭제"
                          id={`history-delete-btn-${item.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* RIGHT: Dynamic Simulation Dashboard & AI analysis Display (7 Cols) */}
          <main className="lg:col-span-7 space-y-6" id="dashboard-results-container">
            
            {/* Dynamic Interactive Analytics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4" id="simulation-cards">
              
              {/* Dynamic Metric 1: Economic Benefit */}
              <div className="bg-[#FDF6E9] p-5 rounded-2xl border border-[#F2E0C9] flex flex-col justify-between" id="metric-economic">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#A68A5E] uppercase tracking-wider">추정 전기세 절감</span>
                  <div className="p-1.5 bg-[#FDF6E9] text-[#C28135] rounded-lg">
                    <Landmark className="w-4 h-4" />
                  </div>
                </div>
                <div className="my-3">
                  <div className="text-xl sm:text-2xl font-extrabold text-[#C28135]">
                    약 {savedMoney.toLocaleString()}원
                  </div>
                  <p className="text-[11px] text-[#A68A5E]/90 mt-1">한 달 간 전기 요금 절감 혜택</p>
                </div>
                <div className="text-[10px] text-[#A68A5E]/70 border-t border-[#F2E0C9]/40 pt-2 bg-[#FDF6E9]/50 p-1.5 rounded-md">
                  전기 사용 단계 가중치 200원 기준
                </div>
              </div>

              {/* Dynamic Metric 2: CO2 Reduction */}
              <div className="bg-[#F1F3E9] p-5 rounded-2xl border border-[#E2E6D5] flex flex-col justify-between" id="metric-co2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#8A8D7C] uppercase tracking-wider">이산화탄소 저감</span>
                  <div className="p-1.5 bg-[#F1F3E9] text-[#748E63] rounded-lg">
                    <Leaf className="w-4 h-4" />
                  </div>
                </div>
                <div className="my-3">
                  <div className="text-xl sm:text-2xl font-extrabold text-[#748E63]">
                    약 {co2Reduction} kg
                  </div>
                  <p className="text-[11px] text-[#5A5A40] mt-1">발전 전력 청정 에너지 대체 환산</p>
                </div>
                <div className="text-[10px] text-[#8A8D7C] bg-[#E2E6D5]/50 border border-[#E2E6D5]/40 p-1.5 rounded-md">
                  석탄화력 배출계수 0.441kg 환산
                </div>
              </div>

              {/* Dynamic Metric 3: Pine Trees Equivalent */}
              <div className="bg-[#F1F3E9] p-5 rounded-2xl border border-[#E2E6D5] flex flex-col justify-between" id="metric-trees">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#8A8D7C] uppercase tracking-wider">소나무 심기 효과</span>
                  <div className="p-1.5 bg-[#F1F3E9] text-[#748E63] rounded-lg">
                    <Trees className="w-4 h-4" />
                  </div>
                </div>
                <div className="my-3">
                  <div className="text-xl sm:text-2xl font-extrabold text-[#748E63]">
                    약 {pineTrees} 그루
                  </div>
                  <p className="text-[11px] text-[#5A5A40] mt-1">우리 집 마당 소나무 숲 조성 가치</p>
                </div>
                <div className="text-[10px] text-[#8A8D7C] bg-[#E2E6D5]/50 border border-[#E2E6D5]/40 p-1.5 rounded-md">
                  소나무 한 해 CO2 흡수량 6.6kg 환산
                </div>
              </div>

            </div>

            {/* Interactive Visual Graph and Gauge Card */}
            <div className="bg-white rounded-[32px] p-6 shadow-sm border border-[#E9EBE0] flex flex-col gap-6" id="visualization-card">
              <h3 className="font-serif font-bold text-[#4A4A35] text-base flex items-center gap-2">
                <Gauge className="w-5 h-5 text-[#748E63]" />
                <span>에너지 자립도 및 전력 구조 시각화</span>
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                
                {/* SVG Radial Gauge */}
                <div className="flex flex-col items-center justify-center p-4 bg-[#F7F8F2] rounded-2xl border border-[#E9EBE0] relative">
                  <div className="relative w-44 h-44 flex items-center justify-center">
                    {/* SVG Progress Circle */}
                    <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                      {/* Background circle */}
                      <circle
                        cx="50"
                        cy="50"
                        r="40"
                        className="stroke-[#F0F2E8]"
                        strokeWidth="8"
                        fill="transparent"
                      />
                      {/* Active Fill Circle */}
                      <circle
                        cx="50"
                        cy="50"
                        r="40"
                        stroke="#748E63"
                        strokeWidth="8"
                        fill="transparent"
                        strokeDasharray={251.2}
                        strokeDashoffset={251.2 - (251.2 * activeRatio) / 100}
                        strokeLinecap="round"
                        className="transition-all duration-1000 ease-out"
                      />
                    </svg>
                    {/* Inner percentage Text */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                      <span className="text-3xl font-extrabold text-[#4A4A35] tracking-tight">{activeRatio}%</span>
                      <span className="text-[11px] text-[#8A8D7C] font-semibold mt-1">태양광 에너지 자립</span>
                    </div>
                  </div>
                  
                  {/* Status labels */}
                  <div className={`mt-4 px-3 py-1.5 rounded-full text-xs font-bold border ${status.color} transition-all`}>
                    {status.label}
                  </div>
                  <p className="text-[11px] text-[#8A8D7C] text-center mt-2 px-4 leading-normal">
                    {status.desc}
                  </p>
                </div>

                {/* SVG custom Energy Balance Stack Bar */}
                <div className="flex flex-col gap-4 p-4 bg-[#F7F8F2] rounded-2xl border border-[#E9EBE0] justify-center">
                  <h4 className="text-xs font-bold text-[#4A4A35]">🔌 전력 조달 포트폴리오 (월 기준)</h4>
                  
                  {/* Progress Stack bar */}
                  <div className="w-full flex flex-col gap-1">
                    <div className="h-7 w-full bg-[#F0F2E8] rounded-full overflow-hidden flex text-[10px] font-bold text-white relative">
                      {/* Solar Portion */}
                      {generation > 0 && (
                        <div
                          style={{ width: `${(generation / Math.max(consumption, generation)) * 100}%` }}
                          className="bg-[#748E63] flex items-center justify-center transition-all duration-500"
                        >
                          {Math.round((generation / Math.max(consumption, generation)) * 100) >= 15 && (
                            <span>태양광 {generation}kWh</span>
                          )}
                        </div>
                      )}
                      {/* Bought portion from KEPCO */}
                      {gridPurchase > 0 && (
                        <div
                          style={{ width: `${(gridPurchase / Math.max(consumption, generation)) * 100}%` }}
                          className="bg-[#5A5A48] flex items-center justify-center transition-all duration-500"
                        >
                          {Math.round((gridPurchase / Math.max(consumption, generation)) * 100) >= 15 && (
                            <span>한전구입 {gridPurchase}kWh</span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex justify-between text-[11px] text-[#8A8D7C] font-medium px-1 mt-1">
                      <span>총 전력 사용량: {consumption} kWh</span>
                      {surplusPower > 0 && (
                        <span className="text-[#748E63] font-bold">잉여 전력: +{surplusPower} kWh 🌱</span>
                      )}
                    </div>
                  </div>

                  {/* Portfolio Legend items */}
                  <div className="space-y-2 text-xs pt-1.5 border-t border-[#D8DBCE]">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-[#5A5A48]">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#748E63]" />
                        태양광 자가 소비량
                      </span>
                      <span className="font-bold text-[#4A4A35]">{Math.min(consumption, generation)} kWh</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-[#5A5A48]">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#5A5A48]" />
                        한전 송전망 구입 전력
                      </span>
                      <span className="font-bold text-[#4A4A35]">{gridPurchase} kWh</span>
                    </div>
                    {surplusPower > 0 && (
                      <div className="flex items-center justify-between bg-[#F1F3E9] p-1.5 rounded-lg border border-[#E2E6D5]">
                        <span className="flex items-center gap-1.5 text-[#748E63] font-semibold">
                          <span className="w-2.5 h-2.5 rounded-full bg-[#748E63]" />
                          남은 전력 환원
                        </span>
                        <span className="font-bold text-[#748E63]">{surplusPower} kWh</span>
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </div>



            {/* AI FEEDBACK PANEL / LOADING DISPLAY */}
            <div className="bg-white rounded-[32px] p-6 shadow-sm border border-[#E9EBE0] flex flex-col gap-4 relative overflow-hidden" id="analysis-report-container">
              
              {/* Decorative Natural Green vertical bar */}
              <div className="absolute top-0 right-0 w-2 h-full bg-gradient-to-b from-[#748E63] to-[#A3A694]" />

              {/* Header inside result card */}
              <div className="flex items-center justify-between border-b border-[#E9EBE0] pb-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-[#D8E2DC] text-[#5A5A40] rounded-xl font-bold text-sm">
                    AI
                  </div>
                  <div>
                    <h3 className="font-serif font-bold text-[#4A4A35] text-lg">AI 에너지 전문가 분석 리포트</h3>
                    <p className="text-xs text-[#8A8D7C]">지역 기상 데이터와 가정의 패턴에 맞춘 맞춤형 피드백</p>
                  </div>
                </div>

                {analysis && (
                  <button
                    onClick={handleExportText}
                    className="p-2 text-[#5A5A40] hover:text-[#748E63] hover:bg-[#F1F3E9] rounded-xl border border-[#D1D6BC] hover:border-[#748E63] transition-all cursor-pointer flex items-center gap-1.5 text-xs font-semibold"
                    title="텍스트 파일로 저장"
                    id="export-txt-button"
                  >
                    <Download className="w-4 h-4" />
                    <span className="hidden sm:inline">문서 다운로드</span>
                  </button>
                )}
              </div>

              {/* Content Box */}
              <div className="min-h-48 flex flex-col justify-center" id="analysis-content-box">
                <AnimatePresence mode="wait">
                  {loading ? (
                    /* Loading State animation */
                    <motion.div
                      key="loading"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex flex-col items-center justify-center py-12 text-center px-4"
                      id="analysis-loading"
                    >
                      {/* Rotating Solar Ring */}
                      <div className="relative w-24 h-24 flex items-center justify-center mb-6">
                        {/* Outer Glow rotating Sun */}
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ repeat: Infinity, duration: 15, ease: "linear" }}
                          className="absolute inset-0 rounded-full border-4 border-dashed border-[#748E63] opacity-60"
                        />
                        <motion.div
                          animate={{ rotate: -360 }}
                          transition={{ repeat: Infinity, duration: 8, ease: "linear" }}
                          className="absolute inset-2 rounded-full border-2 border-dotted border-[#A3A694] opacity-40"
                        />
                        <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-[#748E63] to-[#E2E6D5] flex items-center justify-center shadow-lg shadow-[#748E63]/20 text-white">
                          <Sun className="w-7 h-7 animate-pulse text-[#4A4A35]" />
                        </div>
                      </div>

                      {/* Dynamic loading text */}
                      <h4 className="text-[#4A4A35] font-bold text-base mb-2">
                        AI 전문가가 에너지 리포트를 작성하는 중...
                      </h4>
                      
                      {/* Staggered progress display */}
                      <div className="w-full max-w-xs bg-[#F0F2E8] h-2 rounded-full overflow-hidden mb-3">
                        <motion.div
                          initial={{ width: "0%" }}
                          animate={{ width: `${((loadingStep + 1) / loadingMessages.length) * 100}%` }}
                          transition={{ duration: 0.5 }}
                          className="h-full bg-gradient-to-r from-[#748E63] to-[#A3A694]"
                        />
                      </div>

                      <p className="text-xs text-[#8A8D7C] max-w-md h-8 italic leading-normal">
                        {loadingMessages[loadingStep]}
                      </p>
                    </motion.div>
                  ) : errorMsg ? (
                    /* Error State card */
                    <motion.div
                      key="error"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-center py-8 px-4 flex flex-col items-center gap-3"
                      id="analysis-error"
                    >
                      <AlertCircle className="w-12 h-12 text-rose-500" />
                      <h4 className="text-[#4A4A35] font-bold text-base">분석 중 이상이 발생했습니다</h4>
                      <p className="text-xs text-rose-600 max-w-md leading-relaxed">
                        {errorMsg}
                      </p>
                      <button
                        onClick={handleAnalyze}
                        className="mt-2 bg-[#748E63] text-white font-bold text-xs py-2 px-4 rounded-xl hover:bg-[#637d53] transition-all cursor-pointer"
                      >
                        다시 시도하기
                      </button>
                    </motion.div>
                  ) : analysis ? (
                    /* Analysis report display */
                    <motion.div
                      key="analysis-report"
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-1.5 text-left"
                      id="analysis-report-text"
                    >
                      <div className="markdown-body">
                        <Markdown>{analysis}</Markdown>
                      </div>

                      {/* Verification Stamp as high school project */}
                      <div className="mt-8 pt-6 border-t border-[#E9EBE0] flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs text-[#8A8D7C] bg-[#F7F8F2] p-4 rounded-2xl">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-[#748E63]" />
                          <span>본 진단은 고교 과학탐구 교실 AI 전문가 전력 분석 모델에 의해 검증되었습니다.</span>
                        </div>
                        <div className="font-semibold text-[#5A5A40]">
                          {region} 지역 전력망 연구 소그룹
                        </div>
                      </div>
                    </motion.div>
                  ) : (
                    /* Blank Welcome State */
                    <motion.div
                      key="welcome"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-center py-12 px-4 flex flex-col items-center justify-center gap-4 text-[#8A8D7C]"
                      id="analysis-empty-welcome"
                    >
                      <div className="p-4 bg-[#FDF6E9] text-[#C28135] rounded-full">
                        <Sparkles className="w-10 h-10 animate-bounce" />
                      </div>
                      <div>
                        <h4 className="text-[#4A4A35] font-serif font-bold text-base">우리 집 태양광 자립도를 진단받아보세요</h4>
                        <p className="text-xs text-[#8A8D7C] mt-1 max-w-sm leading-relaxed mx-auto">
                          좌측 양식에 알맞은 전력 수치를 채우고 <b>AI 전문가 에너지 자립 분석 받기</b> 버튼을 클릭해 보세요. 친절하고 보람찬 진단 리포트가 완성됩니다!
                        </p>
                      </div>
                      
                      {/* Interactive prompt trigger inside welcome box */}
                      <button
                        onClick={handleAnalyze}
                        className="bg-[#748E63] hover:bg-[#637d53] text-white font-semibold text-xs py-2 px-5 rounded-xl transition-all shadow-md hover:scale-105 active:scale-95 cursor-pointer mt-1"
                      >
                        지금 바로 분석 시작하기 ✨
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

            </div>

          </main>
          
        </div>

        {/* Footer Area with high school class project information */}
        <footer className="mt-12 text-center text-[#A3A694] text-xs border-t border-[#D8DBCE] pt-6 space-y-2 leading-relaxed" id="footer">
          <p>
            🏫 본 서비스는 고등학교 융합 과학 탐구 활동의 일환으로 태양광 발전의 효율과 환경적 보상을 직관적으로 계산하기 위해 개발된 <b>학생 창작 프로젝트</b>입니다.
          </p>
          <p className="text-[#A3A694]/80">
            © 2026 우리 집 태양광 에너지 자립도 분석 서비스 Co. - AI Advisor powered by Gemini 3.5. All rights reserved.
          </p>
        </footer>

      </div>
    </div>
  );
}
