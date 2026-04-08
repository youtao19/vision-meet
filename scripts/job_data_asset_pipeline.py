#!/usr/bin/env python3
"""
文件作用说明：
- 负责把原始岗位数据做首轮清洗与标准化归类，产出可复用的数据资产中间结果。
- 当前聚焦比赛第一阶段：快速跑通“导入 -> 清洗 -> 归类 -> 结果落盘”。

职责边界：
- 本脚本只做离线预处理，不直接写数据库。
- 数据入库、画像生成、匹配与报告编排由后端服务链路负责。
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path
from typing import Dict, List, Tuple

import pandas as pd

# 标准岗位族映射：先覆盖高频岗位，后续可接人工配置或数据库字典表。
TITLE_ALIAS_RULES: List[Tuple[re.Pattern[str], str]] = [
    (re.compile(r"java|后端.*java", re.IGNORECASE), "后端开发工程师（Java）"),
    (re.compile(r"python|后端.*python", re.IGNORECASE), "后端开发工程师（Python）"),
    (re.compile(r"前端|web前端|vue|react", re.IGNORECASE), "前端开发工程师"),
    (re.compile(r"测试开发|qa|测试工程师", re.IGNORECASE), "测试开发工程师"),
    (re.compile(r"数据分析|商业分析|bi", re.IGNORECASE), "数据分析师"),
    (re.compile(r"算法|machine learning|机器学习|ai", re.IGNORECASE), "算法工程师"),
    (re.compile(r"产品经理|product manager", re.IGNORECASE), "产品经理"),
    (re.compile(r"运营|用户运营|内容运营", re.IGNORECASE), "运营"),
]

# 全量数据与样例数据字段存在差异，这里统一映射到内部标准列名。
COLUMN_ALIASES: Dict[str, List[str]] = {
    "职位名称": ["职位名称", "岗位名称", "title", "job_title"],
    "工作地址": ["工作地址", "地址", "location", "city"],
    "薪资范围": ["薪资范围", "薪资", "salary_range"],
    "职位描述": ["职位描述", "岗位描述", "岗位详情", "job_description"],
    "公司介绍": ["公司介绍", "公司简介", "公司详情", "company_intro"],
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="岗位数据资产化预处理脚本")
    parser.add_argument(
        "--input",
        type=Path,
        default=Path("data/jobs_sample.csv"),
        help="输入岗位数据文件，支持 csv/xlsx/xls",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("data/processed"),
        help="输出目录",
    )
    return parser.parse_args()


def read_input_dataset(file_path: Path) -> pd.DataFrame:
    """读取输入文件并统一列名。

    参数：
    - file_path: 原始岗位文件路径。

    返回：
    - DataFrame: 含基础岗位字段的数据表。

    注意：
    - 若缺少关键字段会抛出异常，避免产生静默脏数据。
    """

    if not file_path.exists():
        raise FileNotFoundError(f"输入文件不存在: {file_path}")

    suffix = file_path.suffix.lower()
    if suffix == ".csv":
        df = pd.read_csv(file_path)
    elif suffix in {".xlsx", ".xls"}:
        df = pd.read_excel(file_path)
    else:
        raise ValueError(f"暂不支持的文件类型: {suffix}")

    df.columns = [str(col).strip() for col in df.columns]

    # 先做字段别名归一，避免因来源字段差异导致整批数据被拒绝。
    normalized = df.copy()
    source_columns = list(df.columns)
    for target, aliases in COLUMN_ALIASES.items():
        if target in normalized.columns:
            continue
        for alias in aliases:
            if alias in source_columns:
                normalized[target] = df[alias]
                break

    required_columns = ["职位名称", "工作地址", "薪资范围", "职位描述"]
    missing = [col for col in required_columns if col not in normalized.columns]
    if missing:
        raise ValueError(f"输入文件缺少关键字段: {missing}")

    return normalized


def clean_title(raw_title: str) -> str:
    """清洗岗位标题，去掉低信息噪声词与多余符号。"""

    title = str(raw_title or "").strip().lower()
    title = re.sub(r"[【\[（(].*?[】\])）)]", " ", title)
    title = re.sub(r"急聘|双休|五险一金|可实习|接受应届", " ", title)
    title = re.sub(r"\s+", " ", title).strip()
    return title


def clean_text_block(raw_text: str) -> str:
    """清洗职位描述/公司介绍文本，降低 HTML 与模板噪声。"""

    text = str(raw_text or "")
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\r|\n|\t", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def parse_salary_range(raw_salary: str) -> Tuple[float | None, float | None]:
    """将薪资区间解析为最小值与最大值（单位：K/月）。"""

    salary_text = str(raw_salary or "").strip().upper()
    matched = re.search(r"(\d+(?:\.\d+)?)\s*[-~]\s*(\d+(?:\.\d+)?)\s*K", salary_text)
    if not matched:
        return None, None
    return float(matched.group(1)), float(matched.group(2))


def normalize_job_family(title_clean: str) -> str:
    """基于规则将岗位标题归并到标准岗位族。"""

    for pattern, family in TITLE_ALIAS_RULES:
        if pattern.search(title_clean):
            return family
    return "其他岗位"


def build_cleaned_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """构建清洗后的岗位数据表。"""

    cleaned = df.copy()
    cleaned["title_clean"] = cleaned["职位名称"].map(clean_title)
    cleaned["job_description_clean"] = cleaned["职位描述"].map(clean_text_block)
    if "公司介绍" in cleaned.columns:
        cleaned["company_intro_clean"] = cleaned["公司介绍"].map(clean_text_block)
    else:
        cleaned["company_intro_clean"] = ""
    salary_parsed = cleaned["薪资范围"].map(parse_salary_range)
    cleaned["salary_min_k"] = salary_parsed.map(lambda item: item[0])
    cleaned["salary_max_k"] = salary_parsed.map(lambda item: item[1])
    cleaned["normalized_job_family"] = cleaned["title_clean"].map(normalize_job_family)

    # 使用核心字段构建去重键，避免同源重复记录污染后续画像统计。
    cleaned["dedup_key"] = (
        cleaned["title_clean"].fillna("")
        + "|"
        + cleaned["工作地址"].fillna("").astype(str)
        + "|"
        + cleaned["job_description_clean"].fillna("").str.slice(0, 120)
    )
    cleaned = cleaned.drop_duplicates(subset=["dedup_key"], keep="first")
    return cleaned


def build_normalized_summary(cleaned: pd.DataFrame) -> pd.DataFrame:
    """按标准岗位族聚合，产出岗位族规模与薪资统计。"""

    def safe_median(series: pd.Series) -> float | None:
        valid = series.dropna()
        if valid.empty:
            return None
        return float(valid.median())

    summary = (
        cleaned.groupby("normalized_job_family", dropna=False)
        .agg(
            post_count=("normalized_job_family", "count"),
            salary_min_k_p50=("salary_min_k", safe_median),
            salary_max_k_p50=("salary_max_k", safe_median),
        )
        .reset_index()
        .sort_values(by="post_count", ascending=False)
    )
    return summary


def main() -> None:
    args = parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)

    source_df = read_input_dataset(args.input)
    cleaned_df = build_cleaned_dataframe(source_df)
    normalized_summary_df = build_normalized_summary(cleaned_df)

    cleaned_path = args.output_dir / "jobs_cleaned.csv"
    normalized_summary_path = args.output_dir / "job_normalized_summary.csv"

    cleaned_df.to_csv(cleaned_path, index=False)
    normalized_summary_df.to_csv(normalized_summary_path, index=False)

    print(f"[OK] 输入记录数: {len(source_df)}")
    print(f"[OK] 清洗去重后记录数: {len(cleaned_df)}")
    print(f"[OK] 标准岗位族数: {normalized_summary_df['normalized_job_family'].nunique()}")
    print(f"[OUT] {cleaned_path}")
    print(f"[OUT] {normalized_summary_path}")


if __name__ == "__main__":
    main()
