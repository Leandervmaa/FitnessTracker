export type ExerciseSeed = {
  id: string;
  name: string;
  category: string;
  videoUrl: string;
  imageUrl: string;
  sourceVideoId: string;
};

const video = (id: string) => `https://www.youtube.com/shorts/${id}`;
const image = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

export const exerciseLibrarySeed: ExerciseSeed[] = [
  { id: "yt_WMOnJtEzfdc", name: "Upper back pulldown", category: "Rug", videoUrl: video("WMOnJtEzfdc"), imageUrl: image("WMOnJtEzfdc"), sourceVideoId: "WMOnJtEzfdc" },
  { id: "yt_eQNN6liZ2z8", name: "Uni arm cable row", category: "Rug", videoUrl: video("eQNN6liZ2z8"), imageUrl: image("eQNN6liZ2z8"), sourceVideoId: "eQNN6liZ2z8" },
  { id: "yt_EbypcLJDzcE", name: "Side raise cable pulley laag", category: "Schouders", videoUrl: video("EbypcLJDzcE"), imageUrl: image("EbypcLJDzcE"), sourceVideoId: "EbypcLJDzcE" },
  { id: "yt_fLERXuL7W_k", name: "Machine row wide grip", category: "Rug", videoUrl: video("fLERXuL7W_k"), imageUrl: image("fLERXuL7W_k"), sourceVideoId: "fLERXuL7W_k" },
  { id: "yt_N_jl0KlcvKQ", name: "Lying bicep curl", category: "Biceps", videoUrl: video("N_jl0KlcvKQ"), imageUrl: image("N_jl0KlcvKQ"), sourceVideoId: "N_jl0KlcvKQ" },
  { id: "yt_zUdZNoHjw6g", name: "Bicep curl facing in", category: "Biceps", videoUrl: video("zUdZNoHjw6g"), imageUrl: image("zUdZNoHjw6g"), sourceVideoId: "zUdZNoHjw6g" },
  { id: "yt_m4bAIF0CobU", name: "Anterior delt cable raise", category: "Schouders", videoUrl: video("m4bAIF0CobU"), imageUrl: image("m4bAIF0CobU"), sourceVideoId: "m4bAIF0CobU" },
  { id: "yt_MEPHkeo77dE", name: "Lumbar latt pulldown", category: "Rug", videoUrl: video("MEPHkeo77dE"), imageUrl: image("MEPHkeo77dE"), sourceVideoId: "MEPHkeo77dE" },
  { id: "yt_Tc2NPu8cygQ", name: "Incline cable curl", category: "Biceps", videoUrl: video("Tc2NPu8cygQ"), imageUrl: image("Tc2NPu8cygQ"), sourceVideoId: "Tc2NPu8cygQ" },
  { id: "yt_egTba2pWj2o", name: "Lumbar pull around", category: "Rug", videoUrl: video("egTba2pWj2o"), imageUrl: image("egTba2pWj2o"), sourceVideoId: "egTba2pWj2o" },
  { id: "yt_Bick8qdWeLs", name: "Illiac glute pressback", category: "Billen", videoUrl: video("Bick8qdWeLs"), imageUrl: image("Bick8qdWeLs"), sourceVideoId: "Bick8qdWeLs" },
  { id: "yt_AsWahH21fic", name: "Romanian Deadlift", category: "Benen", videoUrl: video("AsWahH21fic"), imageUrl: image("AsWahH21fic"), sourceVideoId: "AsWahH21fic" },
  { id: "yt_6hgcylDMqEA", name: "Hoe gebruik jij straps? (extra grip)", category: "Techniek", videoUrl: video("6hgcylDMqEA"), imageUrl: image("6hgcylDMqEA"), sourceVideoId: "6hgcylDMqEA" },
  { id: "yt_DOqi4uqoqdg", name: "Back foot elevated split squats (smithmachine)", category: "Benen", videoUrl: video("DOqi4uqoqdg"), imageUrl: image("DOqi4uqoqdg"), sourceVideoId: "DOqi4uqoqdg" },
  { id: "yt_Cg3FFgA5LT8", name: "Chest supported pulldown", category: "Rug", videoUrl: video("Cg3FFgA5LT8"), imageUrl: image("Cg3FFgA5LT8"), sourceVideoId: "Cg3FFgA5LT8" },
  { id: "yt_EnVH4KBpmmI", name: "Hanging leg raise (2 varianten)", category: "Core", videoUrl: video("EnVH4KBpmmI"), imageUrl: image("EnVH4KBpmmI"), sourceVideoId: "EnVH4KBpmmI" },
  { id: "yt_xLHqYu2qHHM", name: "EZ Bar curl (back supported)", category: "Biceps", videoUrl: video("xLHqYu2qHHM"), imageUrl: image("xLHqYu2qHHM"), sourceVideoId: "xLHqYu2qHHM" },
  { id: "yt_RV22c3Eb9_Q", name: "(Dual) rope pushdown", category: "Triceps", videoUrl: video("RV22c3Eb9_Q"), imageUrl: image("RV22c3Eb9_Q"), sourceVideoId: "RV22c3Eb9_Q" },
  { id: "yt_yj8VR_sD41A", name: "Chest supported cable side raise", category: "Schouders", videoUrl: video("yj8VR_sD41A"), imageUrl: image("yj8VR_sD41A"), sourceVideoId: "yj8VR_sD41A" },
  { id: "yt_RAgZQbPOIZc", name: "Uni lateral supported pulldown", category: "Rug", videoUrl: video("RAgZQbPOIZc"), imageUrl: image("RAgZQbPOIZc"), sourceVideoId: "RAgZQbPOIZc" },
  { id: "yt_Tuc6wXEclQQ", name: "Straps extra grip", category: "Techniek", videoUrl: video("Tuc6wXEclQQ"), imageUrl: image("Tuc6wXEclQQ"), sourceVideoId: "Tuc6wXEclQQ" },
  { id: "yt_1sb1WxIrd84", name: "Pronated cable row", category: "Rug", videoUrl: video("1sb1WxIrd84"), imageUrl: image("1sb1WxIrd84"), sourceVideoId: "1sb1WxIrd84" },
  { id: "yt_a-RB97qkn8M", name: "Seated calf raise", category: "Kuiten", videoUrl: video("a-RB97qkn8M"), imageUrl: image("a-RB97qkn8M"), sourceVideoId: "a-RB97qkn8M" },
  { id: "yt_qRWawfYx3JA", name: "Hip Adduction machine", category: "Benen", videoUrl: video("qRWawfYx3JA"), imageUrl: image("qRWawfYx3JA"), sourceVideoId: "qRWawfYx3JA" },
  { id: "yt_uUWA9eemsF0", name: "Legpress voeten midden op de plaat", category: "Benen", videoUrl: video("uUWA9eemsF0"), imageUrl: image("uUWA9eemsF0"), sourceVideoId: "uUWA9eemsF0" },
  { id: "yt_u_wnsA1BYYc", name: "Chest supported side raise", category: "Schouders", videoUrl: video("u_wnsA1BYYc"), imageUrl: image("u_wnsA1BYYc"), sourceVideoId: "u_wnsA1BYYc" },
  { id: "yt_yJQ0fKMnO3M", name: "Cable row Lats", category: "Rug", videoUrl: video("yJQ0fKMnO3M"), imageUrl: image("yJQ0fKMnO3M"), sourceVideoId: "yJQ0fKMnO3M" },
  { id: "yt_S0dpPr4DQuA", name: "Cable Y Raise", category: "Schouders", videoUrl: video("S0dpPr4DQuA"), imageUrl: image("S0dpPr4DQuA"), sourceVideoId: "S0dpPr4DQuA" },
  { id: "yt_88J4tFyVrCw", name: "Anterior delt DB Press", category: "Schouders", videoUrl: video("88J4tFyVrCw"), imageUrl: image("88J4tFyVrCw"), sourceVideoId: "88J4tFyVrCw" },
  { id: "yt_4PmbhpuVsDs", name: "Dips", category: "Triceps", videoUrl: video("4PmbhpuVsDs"), imageUrl: image("4PmbhpuVsDs"), sourceVideoId: "4PmbhpuVsDs" },
  { id: "yt_qjQgzOlnnuk", name: "Y Raise DB", category: "Schouders", videoUrl: video("qjQgzOlnnuk"), imageUrl: image("qjQgzOlnnuk"), sourceVideoId: "qjQgzOlnnuk" },
  { id: "yt_tOTfabwFR3A", name: "Sternal DB Press", category: "Borst", videoUrl: video("tOTfabwFR3A"), imageUrl: image("tOTfabwFR3A"), sourceVideoId: "tOTfabwFR3A" },
  { id: "yt_5qf2fmUnZmk", name: "Standing calf raise", category: "Kuiten", videoUrl: video("5qf2fmUnZmk"), imageUrl: image("5qf2fmUnZmk"), sourceVideoId: "5qf2fmUnZmk" },
  { id: "yt_kgrQBRWu50c", name: "Standing uni calf raise", category: "Kuiten", videoUrl: video("kgrQBRWu50c"), imageUrl: image("kgrQBRWu50c"), sourceVideoId: "kgrQBRWu50c" },
  { id: "yt_ZZUAbEoKr0A", name: "Rope crunch", category: "Core", videoUrl: video("ZZUAbEoKr0A"), imageUrl: image("ZZUAbEoKr0A"), sourceVideoId: "ZZUAbEoKr0A" },
  { id: "yt_ao-nbWEJrzE", name: "Romanian deadlift", category: "Benen", videoUrl: video("ao-nbWEJrzE"), imageUrl: image("ao-nbWEJrzE"), sourceVideoId: "ao-nbWEJrzE" },
  { id: "yt_ST2Y_ZEK9As", name: "Reversed machine fly", category: "Schouders", videoUrl: video("ST2Y_ZEK9As"), imageUrl: image("ST2Y_ZEK9As"), sourceVideoId: "ST2Y_ZEK9As" },
  { id: "yt_wE-2TPCEubU", name: "Reversed crunch", category: "Core", videoUrl: video("wE-2TPCEubU"), imageUrl: image("wE-2TPCEubU"), sourceVideoId: "wE-2TPCEubU" },
  { id: "yt_aqknfw9ofQY", name: "Pull up", category: "Rug", videoUrl: video("aqknfw9ofQY"), imageUrl: image("aqknfw9ofQY"), sourceVideoId: "aqknfw9ofQY" },
  { id: "yt_uvMQ-Xrgk3M", name: "Machine pec Fly", category: "Borst", videoUrl: video("uvMQ-Xrgk3M"), imageUrl: image("uvMQ-Xrgk3M"), sourceVideoId: "uvMQ-Xrgk3M" },
  { id: "yt_lk6F5-Dsgxw", name: "Machine Press", category: "Borst", videoUrl: video("lk6F5-Dsgxw"), imageUrl: image("lk6F5-Dsgxw"), sourceVideoId: "lk6F5-Dsgxw" },
  { id: "yt_j8AjyLhsHfM", name: "Lying leg curl", category: "Benen", videoUrl: video("j8AjyLhsHfM"), imageUrl: image("j8AjyLhsHfM"), sourceVideoId: "j8AjyLhsHfM" },
  { id: "yt_0Z1NrfOCBWg", name: "Legpress (Glutes)", category: "Billen", videoUrl: video("0Z1NrfOCBWg"), imageUrl: image("0Z1NrfOCBWg"), sourceVideoId: "0Z1NrfOCBWg" },
  { id: "yt_njqq3Zey7eg", name: "Legpress (adductoren)", category: "Benen", videoUrl: video("njqq3Zey7eg"), imageUrl: image("njqq3Zey7eg"), sourceVideoId: "njqq3Zey7eg" },
  { id: "yt_Aup2D1tTDKA", name: "Leg extension", category: "Benen", videoUrl: video("Aup2D1tTDKA"), imageUrl: image("Aup2D1tTDKA"), sourceVideoId: "Aup2D1tTDKA" },
  { id: "yt_h5iKkwiOgXE", name: "Lat pulldown", category: "Rug", videoUrl: video("h5iKkwiOgXE"), imageUrl: image("h5iKkwiOgXE"), sourceVideoId: "h5iKkwiOgXE" },
  { id: "yt_GhGI0RMErrY", name: "Incline DB Fly", category: "Borst", videoUrl: video("GhGI0RMErrY"), imageUrl: image("GhGI0RMErrY"), sourceVideoId: "GhGI0RMErrY" },
  { id: "yt_Tfat5HyxdbI", name: "Incline DB Press", category: "Borst", videoUrl: video("Tfat5HyxdbI"), imageUrl: image("Tfat5HyxdbI"), sourceVideoId: "Tfat5HyxdbI" },
  { id: "yt_1WiA0cbNgUo", name: "Hyper extensions", category: "Benen", videoUrl: video("1WiA0cbNgUo"), imageUrl: image("1WiA0cbNgUo"), sourceVideoId: "1WiA0cbNgUo" },
  { id: "yt_MThkKZpphis", name: "Hamstring curl seated", category: "Benen", videoUrl: video("MThkKZpphis"), imageUrl: image("MThkKZpphis"), sourceVideoId: "MThkKZpphis" },
  { id: "yt_GEEZyop6Fi0", name: "Hacksquat", category: "Benen", videoUrl: video("GEEZyop6Fi0"), imageUrl: image("GEEZyop6Fi0"), sourceVideoId: "GEEZyop6Fi0" },
  { id: "yt_99E9dPQp514", name: "Glutes medius abstention", category: "Billen", videoUrl: video("99E9dPQp514"), imageUrl: image("99E9dPQp514"), sourceVideoId: "99E9dPQp514" },
  { id: "yt_1UGZQ6ZqEY0", name: "Glute bridge", category: "Billen", videoUrl: video("1UGZQ6ZqEY0"), imageUrl: image("1UGZQ6ZqEY0"), sourceVideoId: "1UGZQ6ZqEY0" },
  { id: "yt_J2jgO_YbYn0", name: "Facing out bicep curl", category: "Biceps", videoUrl: video("J2jgO_YbYn0"), imageUrl: image("J2jgO_YbYn0"), sourceVideoId: "J2jgO_YbYn0" },
  { id: "yt_KiQfDu2H-Wc", name: "DD Extensions", category: "Triceps", videoUrl: video("KiQfDu2H-Wc"), imageUrl: image("KiQfDu2H-Wc"), sourceVideoId: "KiQfDu2H-Wc" },
  { id: "yt_TDD0hf2LH8g", name: "DB Upperback row", category: "Rug", videoUrl: video("TDD0hf2LH8g"), imageUrl: image("TDD0hf2LH8g"), sourceVideoId: "TDD0hf2LH8g" },
  { id: "yt_c-ZdGFkixC4", name: "DB Row", category: "Rug", videoUrl: video("c-ZdGFkixC4"), imageUrl: image("c-ZdGFkixC4"), sourceVideoId: "c-ZdGFkixC4" },
  { id: "yt_oWibZTIviyk", name: "DB Preacher curl", category: "Biceps", videoUrl: video("oWibZTIviyk"), imageUrl: image("oWibZTIviyk"), sourceVideoId: "oWibZTIviyk" },
  { id: "yt_QVpH8aJXKkA", name: "Crossed cable tricep extensions", category: "Triceps", videoUrl: video("QVpH8aJXKkA"), imageUrl: image("QVpH8aJXKkA"), sourceVideoId: "QVpH8aJXKkA" },
  { id: "yt_GjAP5-8MsJY", name: "Costal pec fly", category: "Borst", videoUrl: video("GjAP5-8MsJY"), imageUrl: image("GjAP5-8MsJY"), sourceVideoId: "GjAP5-8MsJY" },
];
