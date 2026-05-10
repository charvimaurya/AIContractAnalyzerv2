
export type RiskSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export interface Risk {
  risk_type: string;
  severity: RiskSeverity;
  clause_reference: string;
  explanation: string;
  why_it_matters: string;
}

export interface PlainEnglishExplanation {
  clause_title: string;
  original_text: string;
  plain_english: string;
  implication: string;
}

export interface RentalDashboard {
  monthly_rent: string;
  security_deposit: string;
  lease_duration: string;
  move_in_date: string;
  notice_period: string;
  utilities_included: string;
  renewal_terms: string;
  early_termination_fee: string;
}

export interface DataQuality {
  ocr_confidence: string;
  extraction_confidence: string;
  issues_detected: string[];
}

export interface ContractFields {
  rent: string;
  deposit: string;
  lease_duration: string;
  notice_period: string;
  termination_clause: string;
  /** Lease / move-in start date from contract */
  start_date?: string;
  /** Utilities included / responsibility */
  utilities?: string;
}

export interface Conflict {
  clause_a: string;
  clause_b: string;
  topic: string;
  explanation: string;
}

export interface ContractAnalysis {
  status: 'approved' | 'rejected';
  /** Set after successful RAG upload — required for contract chat */
  session_id?: string;
  reason?: string;
  supported_inputs?: string[];
  next_step?: string;
  
  validation?: 'approved' | 'rejected';
  data_quality?: DataQuality;
  contract_fields?: ContractFields;
  conflicts?: Conflict[];
  risks?: Risk[];
  missing_fields?: string[];
  warnings?: string[];
  final_summary?: string;
  recommendation?: string;
  confidence_score?: number;

  // Keeping some old fields for compatibility during transition or if prompt still uses them
  important_clauses?: PlainEnglishExplanation[];
  questions_to_ask?: string[];
}

export interface FileData {
  name: string;
  type: string;
  size: number;
  data: string; // base64
  /** Original file for multipart upload to the Python API */
  file?: File;
  rawText?: string;
}
