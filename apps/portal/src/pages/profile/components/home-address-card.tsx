import { useState } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { apiClient } from '@/lib/api-client';
import { Card, Input, Button, AddressSearchInput, useToast } from '@/components/ui';
import type { ParsedAddress } from '@/lib/geocoding';

// ─── Home Address Card ────────────────────────────────────

export function HomeAddressCard() {
  const { user, refreshUser } = useAuth();
  const { showToast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [street, setStreet] = useState('');
  const [houseNumber, setHouseNumber] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [city, setCity] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const hasAddress = !!(user?.homeStreet && user?.homeCity);

  // Reset form to current user values when opening edit mode
  const openEdit = () => {
    setStreet(user?.homeStreet ?? '');
    setHouseNumber(user?.homeHouseNumber ?? '');
    setPostalCode(user?.homePostalCode ?? '');
    setCity(user?.homeCity ?? '');
    setLat(user?.homeLat ?? null);
    setLng(user?.homeLng ?? null);
    setIsEditing(true);
  };

  const handleAddressSelect = (address: ParsedAddress) => {
    setStreet(address.street);
    setHouseNumber(address.houseNumber);
    setPostalCode(address.postalCode);
    setCity(address.city);
    setLat(address.lat);
    setLng(address.lng);
  };

  const handleSave = async () => {
    if (!street || !houseNumber || !postalCode || !city) {
      showToast('Vul alle adresvelden in', 'error');
      return;
    }
    setSaving(true);
    try {
      await apiClient.patch('/users/profile', {
        homeStreet: street,
        homeHouseNumber: houseNumber,
        homePostalCode: postalCode,
        homeCity: city,
        homeLat: lat,
        homeLng: lng,
      });
      refreshUser();
      showToast('Thuisadres opgeslagen', 'success');
      setIsEditing(false);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Opslaan mislukt',
        'error',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setSaving(true);
    try {
      await apiClient.patch('/users/profile', {
        homeStreet: null,
        homeHouseNumber: null,
        homePostalCode: null,
        homeCity: null,
        homeLat: null,
        homeLng: null,
      });
      refreshUser();
      showToast('Thuisadres verwijderd', 'success');
      setIsEditing(false);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Verwijderen mislukt',
        'error',
      );
    } finally {
      setSaving(false);
    }
  };

  // Build the autocomplete initial display value
  const addressLabel =
    hasAddress
      ? `${user.homeStreet} ${user.homeHouseNumber}, ${user.homePostalCode} ${user.homeCity}`
      : undefined;

  return (
    <Card title="Thuisadres">
      {!isEditing ? (
        <div className="flex items-start justify-between">
          <div>
            {hasAddress ? (
              <div className="flex items-start gap-2">
                <svg
                  className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
                <div className="text-sm text-gray-900">
                  <p>
                    {user.homeStreet} {user.homeHouseNumber}
                  </p>
                  <p className="text-gray-500">
                    {user.homePostalCode} {user.homeCity}
                  </p>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-sm text-gray-500">
                  Nog geen thuisadres ingesteld
                </p>
                <p className="mt-0.5 text-xs text-gray-400">
                  Wordt gebruikt voor routeplanning
                </p>
              </div>
            )}
          </div>
          <Button variant="secondary" onClick={openEdit}>
            {hasAddress ? 'Wijzigen' : 'Instellen'}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* PDOK autocomplete */}
          <AddressSearchInput
            label="Zoek adres"
            placeholder="Typ een straat, huisnummer of postcode…"
            initialValue={addressLabel}
            onSelect={handleAddressSelect}
          />

          {/* Manual fields */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Input
                label="Straat"
                value={street}
                onChange={(e) => setStreet(e.target.value)}
                placeholder="Hoofdstraat"
              />
            </div>
            <Input
              label="Huisnummer"
              value={houseNumber}
              onChange={(e) => setHouseNumber(e.target.value)}
              placeholder="1A"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Postcode"
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
              placeholder="1234 AB"
              maxLength={10}
            />
            <Input
              label="Stad"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Amsterdam"
            />
          </div>

          <div className="flex items-center justify-between border-t border-gray-200 pt-4">
            <div className="flex gap-2">
              <Button onClick={handleSave} isLoading={saving}>
                Opslaan
              </Button>
              <Button
                variant="secondary"
                onClick={() => setIsEditing(false)}
                disabled={saving}
              >
                Annuleren
              </Button>
            </div>
            {hasAddress && (
              <Button variant="danger" onClick={handleClear} isLoading={saving}>
                Adres wissen
              </Button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
