{
  "schemaVersion": "1.0",
  "users": [
    {
      "id": 1,
      "username": "admin",
      "passwordHash": "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8",
      "isAdmin": true,
      "email": "admin@example.com",
      "createdAt": "2023-04-01T10:00:00Z",
      "lastLogin": "2023-04-15T14:30:00Z"
    },
    {
      "id": 2,
      "username": "user",
      "passwordHash": "ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f",
      "isAdmin": false,
      "email": "user@example.com",
      "createdAt": "2023-04-02T11:00:00Z",
      "lastLogin": "2023-04-14T09:15:00Z"
    },
    {
      "id": 3,
      "username": "moderator",
      "passwordHash": "b8c18761a295f1a5d99d0f2f3d4e9bd3d3c9d3e5d6f7a8b9c0d1e2f3a4b5c6d7",
      "isAdmin": true,
      "email": "moderator@example.com",
      "createdAt": "2023-04-03T12:00:00Z",
      "lastLogin": "2023-04-15T16:45:00Z"
    }
  ],
  "updateRequests": [
    {
      "id": 1,
      "type": "ingredient",
      "label": "New Defense Ingredient",
      "x": 150,
      "y": -200,
      "status": "pending",
      "submittedBy": "user",
      "submittedAt": "2023-04-10T08:30:00Z",
      "reviewedBy": null,
      "reviewedAt": null
    },
    {
      "id": 2,
      "type": "campfire",
      "label": "New Campfire Location",
      "x": -300,
      "y": 350,
      "status": "approved",
      "submittedBy": "moderator",
      "submittedAt": "2023-04-11T14:45:00Z",
      "reviewedBy": "admin",
      "reviewedAt": "2023-04-12T10:00:00Z"
    },
    {
      "id": 3,
      "type": "clanBase",
      "label": "Proposed Clan Base",
      "x": 400,
      "y": -150,
      "status": "rejected",
      "submittedBy": "user",
      "submittedAt": "2023-04-13T11:20:00Z",
      "reviewedBy": "moderator",
      "reviewedAt": "2023-04-14T09:30:00Z"
    }
  ],
  "gameElements": {
    "ingredients": [
      {
        "id": "ing_001",
        "label": "Health Potion",
        "x": 100,
        "y": 200
      }
    ],
    "clanBases": [
      {
        "id": "cb_001",
        "label": "Alpha Clan HQ",
        "x": -200,
        "y": -300
      }
    ],
    "campfires": [
      {
        "id": "cf_001",
        "label": "Forest Campfire",
        "x": 300,
        "y": 400
      }
    ]
  }
}