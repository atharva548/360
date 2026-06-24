"use client";

import { useState } from "react";
import { CITIES, INTERESTS, LANGUAGES } from "@/lib/constants";

interface GatewayFormProps {
  onSuccess: (data: {
    leadId: string;
    communityName: string;
    inviteLink: string;
    leadName: string;
  }) => void;
}

export default function GatewayForm({ onSuccess }: GatewayFormProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [language, setLanguage] = useState("");
  const [interest, setInterest] = useState("");
  const [consented, setConsented] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!consented) {
      setError("You must agree to receive WhatsApp community updates.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, city, language, interest, consented }),
      });

      const data = await res.json();

      if (!data.success) {
        setError(data.error ?? "Unable to route you to a community.");
        return;
      }

      onSuccess({
        leadId: data.lead.id,
        communityName: data.community.name,
        inviteLink: data.community.inviteLink,
        leadName: data.lead.name,
      });
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const fieldLabel = "mb-2 block text-xs font-medium uppercase tracking-[0.1em] text-stone-500";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="name" className={fieldLabel}>
          Full Name
        </label>
        <input
          id="name"
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter your full name"
          className="input-field"
        />
      </div>

      <div>
        <label htmlFor="phone" className={fieldLabel}>
          WhatsApp Number
        </label>
        <input
          id="phone"
          type="tel"
          required
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+91 98765 43210"
          className="input-field"
        />
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <div>
          <label htmlFor="city" className={fieldLabel}>
            City
          </label>
          <select
            id="city"
            required
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="input-field"
          >
            <option value="">Select city</option>
            {CITIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="language" className={fieldLabel}>
            Preferred Language
          </label>
          <select
            id="language"
            required
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="input-field"
          >
            <option value="">Select language</option>
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="interest" className={fieldLabel}>
            Pilgrimage Interest
          </label>
          <select
            id="interest"
            required
            value={interest}
            onChange={(e) => setInterest(e.target.value)}
            className="input-field"
          >
            <option value="">Select interest</option>
            {INTERESTS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="border border-stone-200 bg-[#faf9f7] p-5">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={consented}
            onChange={(e) => setConsented(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded-sm border-stone-300 text-stone-800 focus:ring-stone-400 focus:ring-offset-0"
          />
          <span className="text-sm leading-relaxed text-stone-600">
            I consent to Atlas Travels adding me to a private WhatsApp Community for
            Hajj &amp; Umrah updates. I understand I can leave the community at any time
            and my number will be used only for pilgrimage-related communications.
          </span>
        </label>
      </div>

      {error && (
        <div className="border border-stone-300 bg-[#faf9f7] px-4 py-3 text-sm text-stone-800">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="btn-primary w-full px-6 py-3.5 text-sm"
      >
        {loading ? "Finding your community…" : "Join Your Community →"}
      </button>
    </form>
  );
}
