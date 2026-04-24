// SmartLead API response types

export interface SmartLeadCampaign {
    id: number;
    name: string;
    status: string;
    created_at: string;
    // Additional fields from API
  [key: string]: unknown;
}

export interface SmartLeadSequenceStep {
    seq_number: number;
    seq_delay_details: {
      delay_in_days: number;
    };
    variants: SmartLeadVariant[];
}

export interface SmartLeadVariant {
    id: number;
    subject: string;
    email_body: string;
    variant_label?: string;
}

export interface SmartLeadLead {
    // API may return id as string in paginated /leads response
    id: number | string;
    email: string;
    first_name?: string;
    last_name?: string;
    company_name?: string;
    designation?: string;
    category?: string;
    lead_status?: string;
    industry?: string;
    company_size?: string;
    location?: string;
    city?: string;
    state?: string;
    country?: string;
    [key: string]: unknown;
}

export interface SmartLeadCampaignStats {
    sent_count: number;
    open_count: number;
    click_count: number;
    reply_count: number;
    bounce_count: number;
    open_rate: number;
    click_rate: number;
    reply_rate: number;
    bounce_rate: number;
    unsubscribe_count: number;
}

export interface SmartLeadAnalytics {
    campaign_id: number;
    stats: SmartLeadCampaignStats;
    category_wise_response?: {
      interested?: number;
      not_interested?: number;
      out_of_office?: number;
      closed?: number;
      [key: string]: number | undefined;
    };
}

export interface SmartLeadMessage {
    type: string; // sent, reply, etc.
  time: string;
    message_id?: string;
    email_body?: string;
    [key: string]: unknown;
}

// Internal DB types

export interface DBClient {
    id: string;
    name: string;
    industry_vertical: string | null;
    smartlead_api_key: string | null;
    heyreach_api_key: string | null;
}

export interface DBCampaign {
    id: string;
    client_id: string;
    smartlead_campaign_id: number;
    name: string;
    status: string | null;
    campaign_start_date: string | null;
    target_title: string | null;
    target_company_size: string | null;
    target_industry: string | null;
    target_geography: string | null;
    offer_type: string | null;
    copy_patterns: string[] | null;
    send_volume: number;
    open_rate: number | null;
    reply_rate: number | null;
    bounce_rate: number | null;
    positive_reply_count: number;
    negative_reply_count: number;
    referral_count: number;
    ooo_count: number;
    not_interested_count: number;
    meetings_booked: number;
    list_source: string | null;
}

export interface ClassificationResult {
    offer_type: string;
    copy_patterns: string[];
    target_title_guess: string | null;
    target_industry_guess: string | null;
    target_company_size_guess: string | null;
}
