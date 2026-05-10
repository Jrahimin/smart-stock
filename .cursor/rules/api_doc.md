# API Documentation Rule

## Requirement

Every time a new API route is created or modified, documentation MUST be updated.

---

## Documentation Location

Maintain a centralized file:

docs/api_collection.md

(Optional later: split per module)

---

## For Each Endpoint, Include

### 1. Endpoint

* Method (GET/POST/etc)
* URL path

### 2. Description

* Purpose of the endpoint
* Key behavior

### 3. Request

#### Path Params

#### Query Params

#### Body (if applicable)

Provide a sample request JSON where relevant.

---

### 4. Response

Provide a real example matching response_model.

Example:
{
"success": true,
"message": "...",
"data": [...]
}

---

### 5. Notes (optional)

* edge cases
* validation rules

---

## Format Example

### GET /stocks/{stock_id}/prices

**Description**
Fetch paginated daily prices for a stock.

**Query Params**

* limit: number
* offset: number

**Response**
{
"success": true,
"message": "Daily prices retrieved",
"data": [
{
"id": "...",
"trade_date": "2024-01-01",
"close_price": 123.45
}
]
}

---

## Rules

* Documentation must reflect actual response_model
* Keep examples realistic (not placeholder junk)
* Update docs immediately after route creation
* Do not leave undocumented endpoints

---

## Goal

This file should become:

* Postman-ready reference
* Internal API documentation
* Source of truth for frontend integration