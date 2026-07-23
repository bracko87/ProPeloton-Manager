/**
 * rioStage1SourceRows.ts
 *
 * Static, read-only Rio Stage 1 source-row fixture.
 *
 * Generated from the exported source bundle and normalized to the exact
 * createStageInputFromSourceRows() input contract.
 *
 * No database calls, RPC calls, HTTP requests, writes, dates, or randomness.
 */

import type {
  CreateStageInputFromSourceRowsParams,
} from '../../integration/createStageInputFromSourceRows'

import {
  rioStage1RiderPerformanceAttributes,
} from './rioStage1RiderPerformanceAttributes'

const rioStage1SourceRowsBase = {
  "race": {
    "id": "65739034-f9e5-4b5c-8f21-4ea27451e0d4",
    "name": "Rio Tour"
  },
  "stage": {
    "id": "24709c46-b258-4db3-a3aa-fd92dc37630e",
    "race_id": "65739034-f9e5-4b5c-8f21-4ea27451e0d4",
    "name": "Rio Tour Stage 1: Rio de Janeiro → Niterói",
    "stage_format": "road_race",
    "distance_km": 142
  },
  "participantTeams": [
    {
      "team_id": "1e78d1af-a727-49b2-ab02-4a5187d9f96c",
      "status": "accepted",
      "team_name_snapshot": "Codelco CMPC Cycling"
    },
    {
      "team_id": "4209301c-d768-487b-9ed4-ab2df7e71ed1",
      "status": "accepted",
      "team_name_snapshot": "B3 Brasil"
    },
    {
      "team_id": "49caba57-9a5e-4820-b4bf-06cfc684e8b2",
      "status": "accepted",
      "team_name_snapshot": "BK Novi Beograd"
    },
    {
      "team_id": "5773d1bb-055a-4a0e-807f-bec409e3c41a",
      "status": "accepted",
      "team_name_snapshot": "Brasil National team"
    },
    {
      "team_id": "63c35cd7-40aa-47c1-941a-c27c56d7983f",
      "status": "accepted",
      "team_name_snapshot": "Team Sugarloaf"
    },
    {
      "team_id": "68fc35bb-e9e8-440b-9ebf-1e2f2477d809",
      "status": "accepted",
      "team_name_snapshot": "Antofagasta Pedal Club"
    },
    {
      "team_id": "8310f171-1ce0-4398-be51-e40639c2ff41",
      "status": "accepted",
      "team_name_snapshot": "Telecom Argentina"
    },
    {
      "team_id": "a08e0e49-8212-4d24-afa1-7ddf2564e9ce",
      "status": "accepted",
      "team_name_snapshot": "ProPeloton team"
    },
    {
      "team_id": "a845f1ec-792d-4f7f-8858-eb660b980b54",
      "status": "accepted",
      "team_name_snapshot": "Laza Tour"
    },
    {
      "team_id": "b54ec11e-ec72-4dce-bf5d-050a518b6680",
      "status": "accepted",
      "team_name_snapshot": "Kola"
    },
    {
      "team_id": "bd869e08-77de-4253-9688-876951630631",
      "status": "accepted",
      "team_name_snapshot": "Belo Horizonte Cycle Works"
    },
    {
      "team_id": "c34233af-33e9-4026-b593-b759a950baee",
      "status": "accepted",
      "team_name_snapshot": "Banco de Chile"
    },
    {
      "team_id": "db78499f-21ca-4825-b1e2-dc8ba9e27950",
      "status": "accepted",
      "team_name_snapshot": "MercadoLibre Team"
    },
    {
      "team_id": "dd821f36-bffc-4dae-bfd4-f96ff7837685",
      "status": "accepted",
      "team_name_snapshot": "Curitiba"
    },
    {
      "team_id": "e2a12071-4d43-46f5-9bfb-05bba2b46454",
      "status": "accepted",
      "team_name_snapshot": "Atacama Road League"
    },
    {
      "team_id": "ed992035-95ca-447a-b174-4af5f055d52d",
      "status": "accepted",
      "team_name_snapshot": "Team Pampas"
    },
    {
      "team_id": "f330bfd3-8300-4459-8c52-a80464b1d70f",
      "status": "accepted",
      "team_name_snapshot": "Soda Club"
    },
    {
      "team_id": "f5e2c4a9-bd8a-495e-86b3-81b6c53661c5",
      "status": "accepted",
      "team_name_snapshot": "Banco do Brasil"
    },
    {
      "team_id": "fb4e0151-e07e-49f6-a457-1ef045927b5b",
      "status": "accepted",
      "team_name_snapshot": "Montevideo Buquebus Pro Team"
    },
    {
      "team_id": "fc3fb3be-79d5-495b-b17a-a6e500d38ae9",
      "status": "accepted",
      "team_name_snapshot": "Córdoba YPF Cycling Team"
    }
  ],
  "participantRiders": [
    {
      "rider_id": "11c039af-7247-49d5-94b5-1768b0f1b133",
      "team_id": "4209301c-d768-487b-9ed4-ab2df7e71ed1",
      "start_number": 87,
      "role_snapshot": "Domestique"
    },
    {
      "rider_id": "167490d7-c7bc-4d29-908a-6b518e47e96d",
      "team_id": "4209301c-d768-487b-9ed4-ab2df7e71ed1",
      "start_number": 85,
      "role_snapshot": "Leader"
    },
    {
      "rider_id": "6d0c4090-6ed1-49cc-b11e-14a4c16442ff",
      "team_id": "4209301c-d768-487b-9ed4-ab2df7e71ed1",
      "start_number": 88,
      "role_snapshot": "TT"
    },
    {
      "rider_id": "70178e92-cdb0-40c6-b0a2-9c560142b8f8",
      "team_id": "4209301c-d768-487b-9ed4-ab2df7e71ed1",
      "start_number": 90,
      "role_snapshot": "Domestique"
    },
    {
      "rider_id": "9ac6ebea-9b4c-45a0-b1b6-044bbe8a91f1",
      "team_id": "4209301c-d768-487b-9ed4-ab2df7e71ed1",
      "start_number": 89,
      "role_snapshot": "Sprinter"
    },
    {
      "rider_id": "ba107935-c317-44c7-84fb-9b786e9cbe42",
      "team_id": "4209301c-d768-487b-9ed4-ab2df7e71ed1",
      "start_number": 86,
      "role_snapshot": "All-rounder"
    },
    {
      "rider_id": "1a29ac57-1fb8-4f7c-a24e-3f9e76b3ad51",
      "team_id": "49caba57-9a5e-4820-b4bf-06cfc684e8b2",
      "start_number": 4,
      "role_snapshot": "selected"
    },
    {
      "rider_id": "35f9dedb-9eb6-4d7a-ab28-7289050843ca",
      "team_id": "49caba57-9a5e-4820-b4bf-06cfc684e8b2",
      "start_number": 3,
      "role_snapshot": "selected"
    },
    {
      "rider_id": "5a530ba9-435a-4dcc-991f-c00e1a048f4f",
      "team_id": "49caba57-9a5e-4820-b4bf-06cfc684e8b2",
      "start_number": 2,
      "role_snapshot": "selected"
    },
    {
      "rider_id": "8218bf2c-b2c9-4873-8d6e-006f0a71621d",
      "team_id": "49caba57-9a5e-4820-b4bf-06cfc684e8b2",
      "start_number": 1,
      "role_snapshot": "Leader"
    },
    {
      "rider_id": "9834aadc-353b-44a2-9cc2-00d33aef5cb5",
      "team_id": "49caba57-9a5e-4820-b4bf-06cfc684e8b2",
      "start_number": 6,
      "role_snapshot": "selected"
    },
    {
      "rider_id": "acbbc56e-ea56-4d45-9e0e-5025ca73c2e5",
      "team_id": "49caba57-9a5e-4820-b4bf-06cfc684e8b2",
      "start_number": 5,
      "role_snapshot": "selected"
    },
    {
      "rider_id": "13179ae0-e94e-465c-9428-52de2d7584dd",
      "team_id": "63c35cd7-40aa-47c1-941a-c27c56d7983f",
      "start_number": 109,
      "role_snapshot": "Leader"
    },
    {
      "rider_id": "38986d97-daaa-4df9-9b83-658899afe300",
      "team_id": "63c35cd7-40aa-47c1-941a-c27c56d7983f",
      "start_number": 110,
      "role_snapshot": "Sprinter"
    },
    {
      "rider_id": "5da0e415-07e2-4d5b-9314-fcedbd91d727",
      "team_id": "63c35cd7-40aa-47c1-941a-c27c56d7983f",
      "start_number": 114,
      "role_snapshot": "Climber"
    },
    {
      "rider_id": "b4ff7abe-28fa-4674-9e0c-6a780b73774a",
      "team_id": "63c35cd7-40aa-47c1-941a-c27c56d7983f",
      "start_number": 111,
      "role_snapshot": "Sprinter"
    },
    {
      "rider_id": "d89f68aa-0037-48c5-b9d8-8aad21f43172",
      "team_id": "63c35cd7-40aa-47c1-941a-c27c56d7983f",
      "start_number": 112,
      "role_snapshot": "All-rounder"
    },
    {
      "rider_id": "ec3c53bf-cc7c-4bbe-9152-a0318d32683d",
      "team_id": "63c35cd7-40aa-47c1-941a-c27c56d7983f",
      "start_number": 113,
      "role_snapshot": "Domestique"
    },
    {
      "rider_id": "0b6cc856-d915-4181-a31d-d83065537e50",
      "team_id": "68fc35bb-e9e8-440b-9ebf-1e2f2477d809",
      "start_number": 12,
      "role_snapshot": "Climber"
    },
    {
      "rider_id": "22bf6b4f-38ee-4888-a61e-42ce2f0e4658",
      "team_id": "68fc35bb-e9e8-440b-9ebf-1e2f2477d809",
      "start_number": 7,
      "role_snapshot": "Leader"
    },
    {
      "rider_id": "4dc384c6-0dca-4ed6-a9ad-6e58e1f5f592",
      "team_id": "68fc35bb-e9e8-440b-9ebf-1e2f2477d809",
      "start_number": 9,
      "role_snapshot": "Sprinter"
    },
    {
      "rider_id": "878a8edb-8729-4768-8a53-2d65d3036d6c",
      "team_id": "68fc35bb-e9e8-440b-9ebf-1e2f2477d809",
      "start_number": 11,
      "role_snapshot": "Domestique"
    },
    {
      "rider_id": "94ca0372-16d9-4efe-bc2b-f3656093e776",
      "team_id": "68fc35bb-e9e8-440b-9ebf-1e2f2477d809",
      "start_number": 10,
      "role_snapshot": "Sprinter"
    },
    {
      "rider_id": "ccc19703-729b-4233-9580-3d9c2381dc28",
      "team_id": "68fc35bb-e9e8-440b-9ebf-1e2f2477d809",
      "start_number": 8,
      "role_snapshot": "All-rounder"
    },
    {
      "rider_id": "29250b22-8d38-413b-9af3-408399383667",
      "team_id": "a08e0e49-8212-4d24-afa1-7ddf2564e9ce",
      "start_number": 3,
      "role_snapshot": "selected"
    },
    {
      "rider_id": "6a006297-fa3b-4162-86fa-dff5102d8819",
      "team_id": "a08e0e49-8212-4d24-afa1-7ddf2564e9ce",
      "start_number": 1,
      "role_snapshot": "Leader"
    },
    {
      "rider_id": "7ba24d04-2c6f-4c23-8c5a-67e1bae517cc",
      "team_id": "a08e0e49-8212-4d24-afa1-7ddf2564e9ce",
      "start_number": 4,
      "role_snapshot": "selected"
    },
    {
      "rider_id": "8b104bc2-b004-4cb4-8d49-3ed3245c3d05",
      "team_id": "a08e0e49-8212-4d24-afa1-7ddf2564e9ce",
      "start_number": 2,
      "role_snapshot": "selected"
    },
    {
      "rider_id": "bd2105ed-ef51-4b4c-9cc1-d7f1fb808282",
      "team_id": "a08e0e49-8212-4d24-afa1-7ddf2564e9ce",
      "start_number": 6,
      "role_snapshot": "selected"
    },
    {
      "rider_id": "e308a71d-9ccf-4a38-9991-7ceb657c20de",
      "team_id": "a08e0e49-8212-4d24-afa1-7ddf2564e9ce",
      "start_number": 5,
      "role_snapshot": "selected"
    },
    {
      "rider_id": "48b5f31c-a594-4c5d-8c01-b3ef5b9edb8b",
      "team_id": "a845f1ec-792d-4f7f-8858-eb660b980b54",
      "start_number": 2,
      "role_snapshot": "selected"
    },
    {
      "rider_id": "568caa21-299e-428b-a06f-fe08d43ed15f",
      "team_id": "a845f1ec-792d-4f7f-8858-eb660b980b54",
      "start_number": 3,
      "role_snapshot": "selected"
    },
    {
      "rider_id": "6cdb0ed5-d3eb-40a4-86ad-93dc5352d9cc",
      "team_id": "a845f1ec-792d-4f7f-8858-eb660b980b54",
      "start_number": 1,
      "role_snapshot": "Leader"
    },
    {
      "rider_id": "a7839ca2-d6a4-4223-aef4-30f6fc1384ff",
      "team_id": "a845f1ec-792d-4f7f-8858-eb660b980b54",
      "start_number": 4,
      "role_snapshot": "selected"
    },
    {
      "rider_id": "d5fbd806-bdc9-4539-b734-a410820d5b2f",
      "team_id": "a845f1ec-792d-4f7f-8858-eb660b980b54",
      "start_number": 5,
      "role_snapshot": "selected"
    },
    {
      "rider_id": "dacad8b2-e25a-436d-989a-cc0dc0c602e6",
      "team_id": "a845f1ec-792d-4f7f-8858-eb660b980b54",
      "start_number": 6,
      "role_snapshot": "selected"
    },
    {
      "rider_id": "1e078c43-0316-4887-a1a2-096a42c29a67",
      "team_id": "b54ec11e-ec72-4dce-bf5d-050a518b6680",
      "start_number": 5,
      "role_snapshot": "selected"
    },
    {
      "rider_id": "58e785f3-e32c-4bdd-a429-2503ed71d04a",
      "team_id": "b54ec11e-ec72-4dce-bf5d-050a518b6680",
      "start_number": 3,
      "role_snapshot": "selected"
    },
    {
      "rider_id": "7408ecba-4726-4165-b382-0bfd8f444195",
      "team_id": "b54ec11e-ec72-4dce-bf5d-050a518b6680",
      "start_number": 6,
      "role_snapshot": "selected"
    },
    {
      "rider_id": "7dae4e01-fec9-43ac-94fa-e1ba1e3e1ffb",
      "team_id": "b54ec11e-ec72-4dce-bf5d-050a518b6680",
      "start_number": 1,
      "role_snapshot": "Leader"
    },
    {
      "rider_id": "9edd7492-3498-4d98-907e-78b35e42e28f",
      "team_id": "b54ec11e-ec72-4dce-bf5d-050a518b6680",
      "start_number": 4,
      "role_snapshot": "selected"
    },
    {
      "rider_id": "daf48781-a69f-4a4f-8315-be9077dfcd6b",
      "team_id": "b54ec11e-ec72-4dce-bf5d-050a518b6680",
      "start_number": 2,
      "role_snapshot": "selected"
    },
    {
      "rider_id": "0e1946aa-31fa-4c21-80e6-0bd540700266",
      "team_id": "bd869e08-77de-4253-9688-876951630631",
      "start_number": 29,
      "role_snapshot": "TT"
    },
    {
      "rider_id": "4816be2c-b105-451f-b7da-7a28c686ac6b",
      "team_id": "bd869e08-77de-4253-9688-876951630631",
      "start_number": 30,
      "role_snapshot": "Sprinter"
    },
    {
      "rider_id": "611a0191-2308-424a-a8a5-fb185f1fb17d",
      "team_id": "bd869e08-77de-4253-9688-876951630631",
      "start_number": 27,
      "role_snapshot": "Domestique"
    },
    {
      "rider_id": "811f9986-535a-459f-9117-1009dc2b6364",
      "team_id": "bd869e08-77de-4253-9688-876951630631",
      "start_number": 25,
      "role_snapshot": "Leader"
    },
    {
      "rider_id": "be607f3d-d44f-466d-a642-d83bab51ad54",
      "team_id": "bd869e08-77de-4253-9688-876951630631",
      "start_number": 28,
      "role_snapshot": "Domestique"
    },
    {
      "rider_id": "c6c84e8a-c91b-4b61-8e3a-ea63a5681a57",
      "team_id": "bd869e08-77de-4253-9688-876951630631",
      "start_number": 26,
      "role_snapshot": "All-rounder"
    },
    {
      "rider_id": "1ae2ce46-2810-4066-8d0b-0e42e790d46e",
      "team_id": "c34233af-33e9-4026-b593-b759a950baee",
      "start_number": 59,
      "role_snapshot": "Sprinter"
    },
    {
      "rider_id": "21a89bb6-f05d-40be-8757-650d5ade8a7f",
      "team_id": "c34233af-33e9-4026-b593-b759a950baee",
      "start_number": 57,
      "role_snapshot": "Sprinter"
    },
    {
      "rider_id": "2538e570-4e23-4b4e-bca5-d6d0d2598846",
      "team_id": "c34233af-33e9-4026-b593-b759a950baee",
      "start_number": 60,
      "role_snapshot": "Climber"
    },
    {
      "rider_id": "4d7589f9-e1e8-4855-b940-ca3aac9b1dd8",
      "team_id": "c34233af-33e9-4026-b593-b759a950baee",
      "start_number": 58,
      "role_snapshot": "Domestique"
    },
    {
      "rider_id": "7183779c-48b1-440a-846b-246f43c0d93f",
      "team_id": "c34233af-33e9-4026-b593-b759a950baee",
      "start_number": 56,
      "role_snapshot": "All-rounder"
    },
    {
      "rider_id": "815e0fa6-4c30-4944-b21a-474ac116b49e",
      "team_id": "c34233af-33e9-4026-b593-b759a950baee",
      "start_number": 55,
      "role_snapshot": "Leader"
    },
    {
      "rider_id": "04cc9565-8bcc-4958-86bd-a89e2feda4cd",
      "team_id": "dd821f36-bffc-4dae-bfd4-f96ff7837685",
      "start_number": 48,
      "role_snapshot": "Sprinter"
    },
    {
      "rider_id": "4678c868-d3f8-4bb2-8906-4777fd3a1f40",
      "team_id": "dd821f36-bffc-4dae-bfd4-f96ff7837685",
      "start_number": 45,
      "role_snapshot": "Domestique"
    },
    {
      "rider_id": "6c624beb-ed5e-4571-84e4-29e17296a36f",
      "team_id": "dd821f36-bffc-4dae-bfd4-f96ff7837685",
      "start_number": 46,
      "role_snapshot": "Climber"
    },
    {
      "rider_id": "b0c20d95-8dda-423b-99ff-ea453308116d",
      "team_id": "dd821f36-bffc-4dae-bfd4-f96ff7837685",
      "start_number": 47,
      "role_snapshot": "Sprinter"
    },
    {
      "rider_id": "e2366450-9e28-44fd-9b39-2000898cd906",
      "team_id": "dd821f36-bffc-4dae-bfd4-f96ff7837685",
      "start_number": 43,
      "role_snapshot": "Leader"
    },
    {
      "rider_id": "f6084e7d-7032-4837-87f2-7e07df32983c",
      "team_id": "dd821f36-bffc-4dae-bfd4-f96ff7837685",
      "start_number": 44,
      "role_snapshot": "All-rounder"
    },
    {
      "rider_id": "055ab6ec-5e3d-400b-98d5-6ffd2d00ee80",
      "team_id": "e2a12071-4d43-46f5-9bfb-05bba2b46454",
      "start_number": 14,
      "role_snapshot": "TT"
    },
    {
      "rider_id": "085d645b-b3d5-45f8-b563-d8382501eb6b",
      "team_id": "e2a12071-4d43-46f5-9bfb-05bba2b46454",
      "start_number": 15,
      "role_snapshot": "All-rounder"
    },
    {
      "rider_id": "1448bbe9-b8e2-4a13-9834-8ae721c3dcb3",
      "team_id": "e2a12071-4d43-46f5-9bfb-05bba2b46454",
      "start_number": 13,
      "role_snapshot": "Leader"
    },
    {
      "rider_id": "47bc417d-69e7-4824-a13f-2e314eee0b4b",
      "team_id": "e2a12071-4d43-46f5-9bfb-05bba2b46454",
      "start_number": 16,
      "role_snapshot": "Breakaway"
    },
    {
      "rider_id": "80fb82cd-8762-4feb-96ee-01ddc73d6998",
      "team_id": "e2a12071-4d43-46f5-9bfb-05bba2b46454",
      "start_number": 18,
      "role_snapshot": "Sprinter"
    },
    {
      "rider_id": "b5676002-aabf-4101-9c78-d48c7dac7f06",
      "team_id": "e2a12071-4d43-46f5-9bfb-05bba2b46454",
      "start_number": 17,
      "role_snapshot": "Climber"
    },
    {
      "rider_id": "33b24251-c6f3-415b-92ce-f7f72fab7503",
      "team_id": "ed992035-95ca-447a-b174-4af5f055d52d",
      "start_number": 74,
      "role_snapshot": "Climber"
    },
    {
      "rider_id": "485f7344-d00c-4c75-8b7a-b1acc628bee6",
      "team_id": "ed992035-95ca-447a-b174-4af5f055d52d",
      "start_number": 77,
      "role_snapshot": "Climber"
    },
    {
      "rider_id": "4b980827-aeb1-46f2-8174-5017fea39334",
      "team_id": "ed992035-95ca-447a-b174-4af5f055d52d",
      "start_number": 75,
      "role_snapshot": "Sprinter"
    },
    {
      "rider_id": "513f85cc-c2f3-4c61-904c-91623cbb0f54",
      "team_id": "ed992035-95ca-447a-b174-4af5f055d52d",
      "start_number": 73,
      "role_snapshot": "Leader"
    },
    {
      "rider_id": "5fc0c90d-10fc-41fc-866e-07e48a8728bf",
      "team_id": "ed992035-95ca-447a-b174-4af5f055d52d",
      "start_number": 78,
      "role_snapshot": "TT"
    },
    {
      "rider_id": "e1b0b5f2-cf94-4025-9580-3078a814f4c1",
      "team_id": "ed992035-95ca-447a-b174-4af5f055d52d",
      "start_number": 76,
      "role_snapshot": "Domestique"
    },
    {
      "rider_id": "23ea7c92-f1fb-484a-bf1f-f0492fe711b6",
      "team_id": "f330bfd3-8300-4459-8c52-a80464b1d70f",
      "start_number": 5,
      "role_snapshot": "selected"
    },
    {
      "rider_id": "272a5246-ef80-4d6b-9094-16b0e8520641",
      "team_id": "f330bfd3-8300-4459-8c52-a80464b1d70f",
      "start_number": 1,
      "role_snapshot": "Leader"
    },
    {
      "rider_id": "2b490bbb-1024-4ca7-8df7-5602e9c6e406",
      "team_id": "f330bfd3-8300-4459-8c52-a80464b1d70f",
      "start_number": 6,
      "role_snapshot": "selected"
    },
    {
      "rider_id": "2e132fdc-c83d-4e7c-a195-fed9eec866ec",
      "team_id": "f330bfd3-8300-4459-8c52-a80464b1d70f",
      "start_number": 3,
      "role_snapshot": "selected"
    },
    {
      "rider_id": "8bccbff9-6c15-4332-95f4-ddd50f902c78",
      "team_id": "f330bfd3-8300-4459-8c52-a80464b1d70f",
      "start_number": 2,
      "role_snapshot": "selected"
    },
    {
      "rider_id": "e6cdd986-11e7-4c43-91df-ad513dc61695",
      "team_id": "f330bfd3-8300-4459-8c52-a80464b1d70f",
      "start_number": 4,
      "role_snapshot": "selected"
    },
    {
      "rider_id": "1a4d0b56-2399-4d47-ad57-7de99d59afc9",
      "team_id": "f5e2c4a9-bd8a-495e-86b3-81b6c53661c5",
      "start_number": 79,
      "role_snapshot": "Leader"
    },
    {
      "rider_id": "4c1dd146-bd9d-4312-869e-6a6abcb3b104",
      "team_id": "f5e2c4a9-bd8a-495e-86b3-81b6c53661c5",
      "start_number": 81,
      "role_snapshot": "Sprinter"
    },
    {
      "rider_id": "81ec988b-e812-4d22-b92f-22b09e03374d",
      "team_id": "f5e2c4a9-bd8a-495e-86b3-81b6c53661c5",
      "start_number": 82,
      "role_snapshot": "Sprinter"
    },
    {
      "rider_id": "c62ed64a-b0f1-44e9-8f5b-cf1e4b789325",
      "team_id": "f5e2c4a9-bd8a-495e-86b3-81b6c53661c5",
      "start_number": 83,
      "role_snapshot": "All-rounder"
    },
    {
      "rider_id": "d4af45a7-51a5-4126-86c5-cc729a0b2697",
      "team_id": "f5e2c4a9-bd8a-495e-86b3-81b6c53661c5",
      "start_number": 84,
      "role_snapshot": "Climber"
    },
    {
      "rider_id": "f0eb3994-0c28-4498-84e4-14b9cc3a95b5",
      "team_id": "f5e2c4a9-bd8a-495e-86b3-81b6c53661c5",
      "start_number": 80,
      "role_snapshot": "Domestique"
    },
    {
      "rider_id": "0425e015-0067-4b31-b2f3-b8bc40f5896d",
      "team_id": "fb4e0151-e07e-49f6-a457-1ef045927b5b",
      "start_number": 71,
      "role_snapshot": "Sprinter"
    },
    {
      "rider_id": "1af7ab56-cc50-4482-81a8-39eaace44fb7",
      "team_id": "fb4e0151-e07e-49f6-a457-1ef045927b5b",
      "start_number": 67,
      "role_snapshot": "Leader"
    },
    {
      "rider_id": "3d456fea-8f25-4567-bcdf-66cf561b5ca1",
      "team_id": "fb4e0151-e07e-49f6-a457-1ef045927b5b",
      "start_number": 70,
      "role_snapshot": "Sprinter"
    },
    {
      "rider_id": "53c074b4-9a22-4c74-b267-cd445937db8d",
      "team_id": "fb4e0151-e07e-49f6-a457-1ef045927b5b",
      "start_number": 69,
      "role_snapshot": "TT"
    },
    {
      "rider_id": "6c24e5f7-1a76-43e7-92bc-0834a309f2a6",
      "team_id": "fb4e0151-e07e-49f6-a457-1ef045927b5b",
      "start_number": 72,
      "role_snapshot": "Domestique"
    },
    {
      "rider_id": "a57cf401-62cb-4c8e-aa2f-ad3d477f58d4",
      "team_id": "fb4e0151-e07e-49f6-a457-1ef045927b5b",
      "start_number": 68,
      "role_snapshot": "All-rounder"
    },
    {
      "rider_id": "0b74e10c-a95a-41c1-b66a-122a1fa37781",
      "team_id": "fc3fb3be-79d5-495b-b17a-a6e500d38ae9",
      "start_number": 37,
      "role_snapshot": "Leader"
    },
    {
      "rider_id": "1f1c589d-5e36-4faa-8c2a-0963738be5c1",
      "team_id": "fc3fb3be-79d5-495b-b17a-a6e500d38ae9",
      "start_number": 38,
      "role_snapshot": "Domestique"
    },
    {
      "rider_id": "7edf1538-ac00-49b7-b43e-59bb0aea8732",
      "team_id": "fc3fb3be-79d5-495b-b17a-a6e500d38ae9",
      "start_number": 39,
      "role_snapshot": "Domestique"
    },
    {
      "rider_id": "def329f4-90f6-4eea-b547-c60df0973459",
      "team_id": "fc3fb3be-79d5-495b-b17a-a6e500d38ae9",
      "start_number": 41,
      "role_snapshot": "Climber"
    },
    {
      "rider_id": "e5aa4ff6-f9e5-4686-a8b1-d55a89dd0c9d",
      "team_id": "fc3fb3be-79d5-495b-b17a-a6e500d38ae9",
      "start_number": 40,
      "role_snapshot": "All-rounder"
    },
    {
      "rider_id": "f0f5ddc5-6d77-43e3-820c-9f9501c97692",
      "team_id": "fc3fb3be-79d5-495b-b17a-a6e500d38ae9",
      "start_number": 42,
      "role_snapshot": "Sprinter"
    }
  ],
  "riders": [
    {
      "id": "0425e015-0067-4b31-b2f3-b8bc40f5896d",
      "first_name": "Agustin",
      "last_name": "Alvarez",
      "display_name": "A. Alvarez",
      "flat": 57,
      "sprint": 62,
      "endurance": 54,
      "resistance": 52,
      "recovery": 54,
      "race_iq": 54,
      "teamwork": 52
    },
    {
      "id": "04cc9565-8bcc-4958-86bd-a89e2feda4cd",
      "first_name": "Jan",
      "last_name": "Potocnik",
      "display_name": "J. Potocnik",
      "flat": 67,
      "sprint": 71,
      "endurance": 65,
      "resistance": 65,
      "recovery": 66,
      "race_iq": 68,
      "teamwork": 69
    },
    {
      "id": "055ab6ec-5e3d-400b-98d5-6ffd2d00ee80",
      "first_name": "Sebastian",
      "last_name": "Valenzuela",
      "display_name": "S. Valenzuela",
      "flat": 50,
      "sprint": 47,
      "endurance": 53,
      "resistance": 51,
      "recovery": 52,
      "race_iq": 54,
      "teamwork": 50
    },
    {
      "id": "085d645b-b3d5-45f8-b563-d8382501eb6b",
      "first_name": "Benjamin",
      "last_name": "Hernandez",
      "display_name": "B. Hernandez",
      "flat": 57,
      "sprint": 56,
      "endurance": 59,
      "resistance": 57,
      "recovery": 60,
      "race_iq": 59,
      "teamwork": 58
    },
    {
      "id": "0b6cc856-d915-4181-a31d-d83065537e50",
      "first_name": "Sebastian",
      "last_name": "Fuentes",
      "display_name": "S. Fuentes",
      "flat": 48,
      "sprint": 45,
      "endurance": 57,
      "resistance": 52,
      "recovery": 55,
      "race_iq": 53,
      "teamwork": 51
    },
    {
      "id": "0b74e10c-a95a-41c1-b66a-122a1fa37781",
      "first_name": "Mateo",
      "last_name": "Ruiz",
      "display_name": "M. Ruiz",
      "flat": 47,
      "sprint": 48,
      "endurance": 53,
      "resistance": 53,
      "recovery": 53,
      "race_iq": 53,
      "teamwork": 50
    },
    {
      "id": "0e1946aa-31fa-4c21-80e6-0bd540700266",
      "first_name": "Rafael",
      "last_name": "Santos",
      "display_name": "R. Santos",
      "flat": 51,
      "sprint": 46,
      "endurance": 56,
      "resistance": 50,
      "recovery": 51,
      "race_iq": 50,
      "teamwork": 50
    },
    {
      "id": "11c039af-7247-49d5-94b5-1768b0f1b133",
      "first_name": "Paulo",
      "last_name": "Costa",
      "display_name": "P. Costa",
      "flat": 57,
      "sprint": 53,
      "endurance": 59,
      "resistance": 60,
      "recovery": 56,
      "race_iq": 57,
      "teamwork": 61
    },
    {
      "id": "13179ae0-e94e-465c-9428-52de2d7584dd",
      "first_name": "Lucas",
      "last_name": "de Jesus",
      "display_name": "L. de Jesus",
      "flat": 51,
      "sprint": 51,
      "endurance": 57,
      "resistance": 53,
      "recovery": 56,
      "race_iq": 56,
      "teamwork": 53
    },
    {
      "id": "1448bbe9-b8e2-4a13-9834-8ae721c3dcb3",
      "first_name": "Ignacio",
      "last_name": "Espinoza",
      "display_name": "I. Espinoza",
      "flat": 53,
      "sprint": 51,
      "endurance": 60,
      "resistance": 62,
      "recovery": 62,
      "race_iq": 60,
      "teamwork": 59
    },
    {
      "id": "167490d7-c7bc-4d29-908a-6b518e47e96d",
      "first_name": "Paulo",
      "last_name": "Lima",
      "display_name": "P. Lima",
      "flat": 65,
      "sprint": 67,
      "endurance": 63,
      "resistance": 59,
      "recovery": 62,
      "race_iq": 62,
      "teamwork": 60
    },
    {
      "id": "1a29ac57-1fb8-4f7c-a24e-3f9e76b3ad51",
      "first_name": "Marko",
      "last_name": "Kovacic",
      "display_name": "M. Kovacic",
      "flat": 51,
      "sprint": 57,
      "endurance": 58,
      "resistance": 52,
      "recovery": 59,
      "race_iq": 58,
      "teamwork": 58
    },
    {
      "id": "1a4d0b56-2399-4d47-ad57-7de99d59afc9",
      "first_name": "Bruno",
      "last_name": "Alves",
      "display_name": "B. Alves",
      "flat": 78,
      "sprint": 72,
      "endurance": 81,
      "resistance": 77,
      "recovery": 79,
      "race_iq": 80,
      "teamwork": 78
    },
    {
      "id": "1ae2ce46-2810-4066-8d0b-0e42e790d46e",
      "first_name": "Sebastian",
      "last_name": "Rojas",
      "display_name": "S. Rojas",
      "flat": 63,
      "sprint": 66,
      "endurance": 58,
      "resistance": 59,
      "recovery": 60,
      "race_iq": 58,
      "teamwork": 58
    },
    {
      "id": "1af7ab56-cc50-4482-81a8-39eaace44fb7",
      "first_name": "Agustin",
      "last_name": "Morales",
      "display_name": "A. Morales",
      "flat": 50,
      "sprint": 47,
      "endurance": 56,
      "resistance": 58,
      "recovery": 60,
      "race_iq": 57,
      "teamwork": 53
    },
    {
      "id": "1e078c43-0316-4887-a1a2-096a42c29a67",
      "first_name": "Flamur",
      "last_name": "Gjoni",
      "display_name": "F. Gjoni",
      "flat": 53,
      "sprint": 52,
      "endurance": 59,
      "resistance": 55,
      "recovery": 61,
      "race_iq": 55,
      "teamwork": 55
    },
    {
      "id": "1f1c589d-5e36-4faa-8c2a-0963738be5c1",
      "first_name": "Valentin",
      "last_name": "Benitez",
      "display_name": "V. Benitez",
      "flat": 55,
      "sprint": 52,
      "endurance": 59,
      "resistance": 58,
      "recovery": 55,
      "race_iq": 55,
      "teamwork": 59
    },
    {
      "id": "21a89bb6-f05d-40be-8757-650d5ade8a7f",
      "first_name": "Juan",
      "last_name": "Contreras",
      "display_name": "J. Contreras",
      "flat": 62,
      "sprint": 65,
      "endurance": 60,
      "resistance": 57,
      "recovery": 59,
      "race_iq": 58,
      "teamwork": 58
    },
    {
      "id": "22bf6b4f-38ee-4888-a61e-42ce2f0e4658",
      "first_name": "Cristobal",
      "last_name": "Hernandez",
      "display_name": "C. Hernandez",
      "flat": 61,
      "sprint": 60,
      "endurance": 59,
      "resistance": 60,
      "recovery": 61,
      "race_iq": 59,
      "teamwork": 59
    },
    {
      "id": "23ea7c92-f1fb-484a-bf1f-f0492fe711b6",
      "first_name": "Herve",
      "last_name": "Yalokhe",
      "display_name": "H. Yalokhe",
      "flat": 66,
      "sprint": 65,
      "endurance": 63,
      "resistance": 65,
      "recovery": 66,
      "race_iq": 65,
      "teamwork": 71
    },
    {
      "id": "2538e570-4e23-4b4e-bca5-d6d0d2598846",
      "first_name": "Nicolas",
      "last_name": "Munoz",
      "display_name": "N. Munoz",
      "flat": 52,
      "sprint": 49,
      "endurance": 58,
      "resistance": 58,
      "recovery": 61,
      "race_iq": 55,
      "teamwork": 58
    },
    {
      "id": "272a5246-ef80-4d6b-9094-16b0e8520641",
      "first_name": "Frederic",
      "last_name": "Beninga",
      "display_name": "F. Beninga",
      "flat": 74,
      "sprint": 73,
      "endurance": 77,
      "resistance": 77,
      "recovery": 77,
      "race_iq": 77,
      "teamwork": 74
    },
    {
      "id": "29250b22-8d38-413b-9af3-408399383667",
      "first_name": "Ivan",
      "last_name": "Markovic",
      "display_name": "I. Markovic",
      "flat": 73,
      "sprint": 77,
      "endurance": 71,
      "resistance": 75,
      "recovery": 70,
      "race_iq": 73,
      "teamwork": 69
    },
    {
      "id": "2b490bbb-1024-4ca7-8df7-5602e9c6e406",
      "first_name": "Dieudonne",
      "last_name": "Nzapalainga",
      "display_name": "D. Nzapalainga",
      "flat": 75,
      "sprint": 62,
      "endurance": 68,
      "resistance": 69,
      "recovery": 69,
      "race_iq": 62,
      "teamwork": 69
    },
    {
      "id": "2e132fdc-c83d-4e7c-a195-fed9eec866ec",
      "first_name": "Didier",
      "last_name": "Nzapalainga",
      "display_name": "D. Nzapalainga",
      "flat": 74,
      "sprint": 66,
      "endurance": 61,
      "resistance": 70,
      "recovery": 67,
      "race_iq": 62,
      "teamwork": 71
    },
    {
      "id": "33b24251-c6f3-415b-92ce-f7f72fab7503",
      "first_name": "Santiago",
      "last_name": "Gonzalez",
      "display_name": "S. Gonzalez",
      "flat": 49,
      "sprint": 48,
      "endurance": 58,
      "resistance": 56,
      "recovery": 56,
      "race_iq": 53,
      "teamwork": 54
    },
    {
      "id": "35f9dedb-9eb6-4d7a-ab28-7289050843ca",
      "first_name": "Felix",
      "last_name": "Muller",
      "display_name": "F. Muller",
      "flat": 51,
      "sprint": 52,
      "endurance": 49,
      "resistance": 51,
      "recovery": 52,
      "race_iq": 51,
      "teamwork": 47
    },
    {
      "id": "38986d97-daaa-4df9-9b83-658899afe300",
      "first_name": "Antonio",
      "last_name": "Alves",
      "display_name": "A. Alves",
      "flat": 63,
      "sprint": 66,
      "endurance": 59,
      "resistance": 62,
      "recovery": 59,
      "race_iq": 59,
      "teamwork": 57
    },
    {
      "id": "3d456fea-8f25-4567-bcdf-66cf561b5ca1",
      "first_name": "Lucas",
      "last_name": "Sosa",
      "display_name": "L. Sosa",
      "flat": 58,
      "sprint": 62,
      "endurance": 55,
      "resistance": 53,
      "recovery": 54,
      "race_iq": 55,
      "teamwork": 51
    },
    {
      "id": "4678c868-d3f8-4bb2-8906-4777fd3a1f40",
      "first_name": "Andre",
      "last_name": "Costa",
      "display_name": "A. Costa",
      "flat": 59,
      "sprint": 51,
      "endurance": 59,
      "resistance": 60,
      "recovery": 58,
      "race_iq": 58,
      "teamwork": 61
    },
    {
      "id": "47bc417d-69e7-4824-a13f-2e314eee0b4b",
      "first_name": "Felipe",
      "last_name": "Silva",
      "display_name": "F. Silva",
      "flat": 56,
      "sprint": 54,
      "endurance": 60,
      "resistance": 62,
      "recovery": 58,
      "race_iq": 62,
      "teamwork": 55
    },
    {
      "id": "4816be2c-b105-451f-b7da-7a28c686ac6b",
      "first_name": "Antonio",
      "last_name": "Santos",
      "display_name": "A. Santos",
      "flat": 54,
      "sprint": 58,
      "endurance": 54,
      "resistance": 52,
      "recovery": 52,
      "race_iq": 52,
      "teamwork": 49
    },
    {
      "id": "485f7344-d00c-4c75-8b7a-b1acc628bee6",
      "first_name": "Joaquin",
      "last_name": "Lopez",
      "display_name": "J. Lopez",
      "flat": 49,
      "sprint": 48,
      "endurance": 53,
      "resistance": 55,
      "recovery": 57,
      "race_iq": 52,
      "teamwork": 51
    },
    {
      "id": "48b5f31c-a594-4c5d-8c01-b3ef5b9edb8b",
      "first_name": "Filip",
      "last_name": "Kovac",
      "display_name": "F. Kovac",
      "flat": 73,
      "sprint": 81,
      "endurance": 72,
      "resistance": 74,
      "recovery": 68,
      "race_iq": 72,
      "teamwork": 68
    },
    {
      "id": "4b980827-aeb1-46f2-8174-5017fea39334",
      "first_name": "Mateo",
      "last_name": "Gonzalez",
      "display_name": "M. Gonzalez",
      "flat": 56,
      "sprint": 59,
      "endurance": 54,
      "resistance": 53,
      "recovery": 55,
      "race_iq": 52,
      "teamwork": 54
    },
    {
      "id": "4c1dd146-bd9d-4312-869e-6a6abcb3b104",
      "first_name": "Jose",
      "last_name": "Pereira",
      "display_name": "J. Pereira",
      "flat": 76,
      "sprint": 81,
      "endurance": 77,
      "resistance": 72,
      "recovery": 75,
      "race_iq": 72,
      "teamwork": 73
    },
    {
      "id": "4d7589f9-e1e8-4855-b940-ca3aac9b1dd8",
      "first_name": "Santiago",
      "last_name": "Rodriguez",
      "display_name": "S. Rodriguez",
      "flat": 60,
      "sprint": 55,
      "endurance": 59,
      "resistance": 61,
      "recovery": 61,
      "race_iq": 58,
      "teamwork": 63
    },
    {
      "id": "4dc384c6-0dca-4ed6-a9ad-6e58e1f5f592",
      "first_name": "Benjamin",
      "last_name": "Torres",
      "display_name": "B. Torres",
      "flat": 64,
      "sprint": 66,
      "endurance": 62,
      "resistance": 58,
      "recovery": 62,
      "race_iq": 61,
      "teamwork": 59
    },
    {
      "id": "513f85cc-c2f3-4c61-904c-91623cbb0f54",
      "first_name": "Facundo",
      "last_name": "Ruiz",
      "display_name": "F. Ruiz",
      "flat": 60,
      "sprint": 58,
      "endurance": 59,
      "resistance": 57,
      "recovery": 59,
      "race_iq": 59,
      "teamwork": 56
    },
    {
      "id": "53c074b4-9a22-4c74-b267-cd445937db8d",
      "first_name": "Felipe",
      "last_name": "Suarez",
      "display_name": "F. Suarez",
      "flat": 57,
      "sprint": 50,
      "endurance": 58,
      "resistance": 53,
      "recovery": 55,
      "race_iq": 55,
      "teamwork": 51
    },
    {
      "id": "568caa21-299e-428b-a06f-fe08d43ed15f",
      "first_name": "Karlo",
      "last_name": "Markovic",
      "display_name": "K. Markovic",
      "flat": 81,
      "sprint": 73,
      "endurance": 68,
      "resistance": 75,
      "recovery": 68,
      "race_iq": 69,
      "teamwork": 76
    },
    {
      "id": "58e785f3-e32c-4bdd-a429-2503ed71d04a",
      "first_name": "Dritan",
      "last_name": "Muca",
      "display_name": "D. Muca",
      "flat": 65,
      "sprint": 61,
      "endurance": 63,
      "resistance": 67,
      "recovery": 62,
      "race_iq": 58,
      "teamwork": 67
    },
    {
      "id": "5a530ba9-435a-4dcc-991f-c00e1a048f4f",
      "first_name": "Vladimir",
      "last_name": "Simic",
      "display_name": "V. Simic",
      "flat": 70,
      "sprint": 68,
      "endurance": 78,
      "resistance": 78,
      "recovery": 78,
      "race_iq": 74,
      "teamwork": 71
    },
    {
      "id": "5da0e415-07e2-4d5b-9314-fcedbd91d727",
      "first_name": "Pedro",
      "last_name": "de Souza",
      "display_name": "P. de Souza",
      "flat": 44,
      "sprint": 43,
      "endurance": 52,
      "resistance": 51,
      "recovery": 55,
      "race_iq": 50,
      "teamwork": 51
    },
    {
      "id": "5fc0c90d-10fc-41fc-866e-07e48a8728bf",
      "first_name": "Mateo",
      "last_name": "Diaz",
      "display_name": "M. Diaz",
      "flat": 53,
      "sprint": 47,
      "endurance": 57,
      "resistance": 54,
      "recovery": 53,
      "race_iq": 53,
      "teamwork": 49
    },
    {
      "id": "611a0191-2308-424a-a8a5-fb185f1fb17d",
      "first_name": "Lucas",
      "last_name": "Costa",
      "display_name": "L. Costa",
      "flat": 58,
      "sprint": 54,
      "endurance": 61,
      "resistance": 59,
      "recovery": 56,
      "race_iq": 57,
      "teamwork": 61
    },
    {
      "id": "6a006297-fa3b-4162-86fa-dff5102d8819",
      "first_name": "Nemanja",
      "last_name": "Stankovic",
      "display_name": "N. Stankovic",
      "flat": 80,
      "sprint": 82,
      "endurance": 84,
      "resistance": 81,
      "recovery": 84,
      "race_iq": 83,
      "teamwork": 82
    },
    {
      "id": "6c24e5f7-1a76-43e7-92bc-0834a309f2a6",
      "first_name": "Juan",
      "last_name": "Alvarez",
      "display_name": "J. Alvarez",
      "flat": 52,
      "sprint": 49,
      "endurance": 56,
      "resistance": 55,
      "recovery": 55,
      "race_iq": 53,
      "teamwork": 56
    },
    {
      "id": "6c624beb-ed5e-4571-84e4-29e17296a36f",
      "first_name": "Felipe",
      "last_name": "da Silva",
      "display_name": "F. da Silva",
      "flat": 46,
      "sprint": 45,
      "endurance": 57,
      "resistance": 54,
      "recovery": 56,
      "race_iq": 54,
      "teamwork": 54
    },
    {
      "id": "6cdb0ed5-d3eb-40a4-86ad-93dc5352d9cc",
      "first_name": "Josip",
      "last_name": "Mikulic",
      "display_name": "J. Mikulic",
      "flat": 77,
      "sprint": 78,
      "endurance": 83,
      "resistance": 81,
      "recovery": 81,
      "race_iq": 84,
      "teamwork": 84
    },
    {
      "id": "6d0c4090-6ed1-49cc-b11e-14a4c16442ff",
      "first_name": "Thiago",
      "last_name": "Lima",
      "display_name": "T. Lima",
      "flat": 57,
      "sprint": 50,
      "endurance": 57,
      "resistance": 55,
      "recovery": 53,
      "race_iq": 56,
      "teamwork": 52
    },
    {
      "id": "70178e92-cdb0-40c6-b0a2-9c560142b8f8",
      "first_name": "Leonardo",
      "last_name": "Santos",
      "display_name": "L. Santos",
      "flat": 51,
      "sprint": 48,
      "endurance": 57,
      "resistance": 55,
      "recovery": 55,
      "race_iq": 53,
      "teamwork": 57
    },
    {
      "id": "7183779c-48b1-440a-846b-246f43c0d93f",
      "first_name": "Martin",
      "last_name": "Flores",
      "display_name": "M. Flores",
      "flat": 52,
      "sprint": 50,
      "endurance": 58,
      "resistance": 53,
      "recovery": 54,
      "race_iq": 57,
      "teamwork": 51
    },
    {
      "id": "7408ecba-4726-4165-b382-0bfd8f444195",
      "first_name": "Gezim",
      "last_name": "Gjoka",
      "display_name": "G. Gjoka",
      "flat": 67,
      "sprint": 62,
      "endurance": 67,
      "resistance": 67,
      "recovery": 65,
      "race_iq": 61,
      "teamwork": 63
    },
    {
      "id": "7ba24d04-2c6f-4c23-8c5a-67e1bae517cc",
      "first_name": "Aleksandar",
      "last_name": "Jankovic",
      "display_name": "A. Jankovic",
      "flat": 76,
      "sprint": 70,
      "endurance": 78,
      "resistance": 78,
      "recovery": 78,
      "race_iq": 76,
      "teamwork": 79
    },
    {
      "id": "7dae4e01-fec9-43ac-94fa-e1ba1e3e1ffb",
      "first_name": "Arben",
      "last_name": "Hysa",
      "display_name": "A. Hysa",
      "flat": 67,
      "sprint": 62,
      "endurance": 68,
      "resistance": 69,
      "recovery": 69,
      "race_iq": 69,
      "teamwork": 65
    },
    {
      "id": "7edf1538-ac00-49b7-b43e-59bb0aea8732",
      "first_name": "Agustin",
      "last_name": "Diaz",
      "display_name": "A. Diaz",
      "flat": 55,
      "sprint": 52,
      "endurance": 58,
      "resistance": 57,
      "recovery": 55,
      "race_iq": 55,
      "teamwork": 59
    },
    {
      "id": "80fb82cd-8762-4feb-96ee-01ddc73d6998",
      "first_name": "Agustin",
      "last_name": "Lopez",
      "display_name": "A. Lopez",
      "flat": 56,
      "sprint": 58,
      "endurance": 52,
      "resistance": 53,
      "recovery": 51,
      "race_iq": 53,
      "teamwork": 50
    },
    {
      "id": "811f9986-535a-459f-9117-1009dc2b6364",
      "first_name": "Gabriel",
      "last_name": "Martins",
      "display_name": "G. Martins",
      "flat": 60,
      "sprint": 57,
      "endurance": 60,
      "resistance": 62,
      "recovery": 59,
      "race_iq": 60,
      "teamwork": 58
    },
    {
      "id": "815e0fa6-4c30-4944-b21a-474ac116b49e",
      "first_name": "Alonso",
      "last_name": "Flores",
      "display_name": "A. Flores",
      "flat": 65,
      "sprint": 57,
      "endurance": 66,
      "resistance": 64,
      "recovery": 64,
      "race_iq": 63,
      "teamwork": 63
    },
    {
      "id": "81ec988b-e812-4d22-b92f-22b09e03374d",
      "first_name": "Pedro",
      "last_name": "Martins",
      "display_name": "P. Martins",
      "flat": 77,
      "sprint": 80,
      "endurance": 75,
      "resistance": 73,
      "recovery": 75,
      "race_iq": 75,
      "teamwork": 72
    },
    {
      "id": "8218bf2c-b2c9-4873-8d6e-006f0a71621d",
      "first_name": "Karlo",
      "last_name": "Matic",
      "display_name": "K. Matic",
      "flat": 74,
      "sprint": 74,
      "endurance": 77,
      "resistance": 80,
      "recovery": 73,
      "race_iq": 77,
      "teamwork": 73
    },
    {
      "id": "878a8edb-8729-4768-8a53-2d65d3036d6c",
      "first_name": "Juan",
      "last_name": "Morales",
      "display_name": "J. Morales",
      "flat": 55,
      "sprint": 49,
      "endurance": 56,
      "resistance": 55,
      "recovery": 53,
      "race_iq": 53,
      "teamwork": 59
    },
    {
      "id": "8b104bc2-b004-4cb4-8d49-3ed3245c3d05",
      "first_name": "Mihajlo",
      "last_name": "Jankovic",
      "display_name": "M. Jankovic",
      "flat": 82,
      "sprint": 82,
      "endurance": 73,
      "resistance": 82,
      "recovery": 77,
      "race_iq": 78,
      "teamwork": 82
    },
    {
      "id": "8bccbff9-6c15-4332-95f4-ddd50f902c78",
      "first_name": "Jean",
      "last_name": "Kokate",
      "display_name": "J. Kokate",
      "flat": 74,
      "sprint": 75,
      "endurance": 66,
      "resistance": 71,
      "recovery": 65,
      "race_iq": 71,
      "teamwork": 68
    },
    {
      "id": "94ca0372-16d9-4efe-bc2b-f3656093e776",
      "first_name": "Benjamin",
      "last_name": "Silva",
      "display_name": "B. Silva",
      "flat": 58,
      "sprint": 60,
      "endurance": 56,
      "resistance": 53,
      "recovery": 54,
      "race_iq": 54,
      "teamwork": 54
    },
    {
      "id": "9834aadc-353b-44a2-9cc2-00d33aef5cb5",
      "first_name": "Lukas",
      "last_name": "Cerny",
      "display_name": "L. Cerny",
      "flat": 56,
      "sprint": 51,
      "endurance": 55,
      "resistance": 59,
      "recovery": 52,
      "race_iq": 54,
      "teamwork": 56
    },
    {
      "id": "9ac6ebea-9b4c-45a0-b1b6-044bbe8a91f1",
      "first_name": "Guilherme",
      "last_name": "Silva",
      "display_name": "G. Silva",
      "flat": 56,
      "sprint": 60,
      "endurance": 51,
      "resistance": 52,
      "recovery": 51,
      "race_iq": 52,
      "teamwork": 52
    },
    {
      "id": "9edd7492-3498-4d98-907e-78b35e42e28f",
      "first_name": "Flamur",
      "last_name": "Muca",
      "display_name": "F. Muca",
      "flat": 67,
      "sprint": 67,
      "endurance": 62,
      "resistance": 66,
      "recovery": 64,
      "race_iq": 67,
      "teamwork": 66
    },
    {
      "id": "a57cf401-62cb-4c8e-aa2f-ad3d477f58d4",
      "first_name": "Tomas",
      "last_name": "Cabrera",
      "display_name": "T. Cabrera",
      "flat": 50,
      "sprint": 50,
      "endurance": 54,
      "resistance": 53,
      "recovery": 53,
      "race_iq": 55,
      "teamwork": 50
    },
    {
      "id": "a7839ca2-d6a4-4223-aef4-30f6fc1384ff",
      "first_name": "Viktor",
      "last_name": "Mikulic",
      "display_name": "V. Mikulic",
      "flat": 74,
      "sprint": 74,
      "endurance": 80,
      "resistance": 78,
      "recovery": 81,
      "race_iq": 78,
      "teamwork": 74
    },
    {
      "id": "acbbc56e-ea56-4d45-9e0e-5025ca73c2e5",
      "first_name": "Nikola",
      "last_name": "Nikolic",
      "display_name": "N. Nikolic",
      "flat": 44,
      "sprint": 48,
      "endurance": 55,
      "resistance": 57,
      "recovery": 49,
      "race_iq": 49,
      "teamwork": 45
    },
    {
      "id": "b0c20d95-8dda-423b-99ff-ea453308116d",
      "first_name": "Guilherme",
      "last_name": "Alves",
      "display_name": "G. Alves",
      "flat": 54,
      "sprint": 56,
      "endurance": 50,
      "resistance": 49,
      "recovery": 49,
      "race_iq": 49,
      "teamwork": 48
    },
    {
      "id": "b4ff7abe-28fa-4674-9e0c-6a780b73774a",
      "first_name": "Marcos",
      "last_name": "de Souza",
      "display_name": "M. de Souza",
      "flat": 57,
      "sprint": 60,
      "endurance": 54,
      "resistance": 56,
      "recovery": 56,
      "race_iq": 54,
      "teamwork": 52
    },
    {
      "id": "b5676002-aabf-4101-9c78-d48c7dac7f06",
      "first_name": "Santiago",
      "last_name": "Rodriguez",
      "display_name": "S. Rodriguez",
      "flat": 46,
      "sprint": 44,
      "endurance": 52,
      "resistance": 54,
      "recovery": 53,
      "race_iq": 54,
      "teamwork": 50
    },
    {
      "id": "ba107935-c317-44c7-84fb-9b786e9cbe42",
      "first_name": "Jose",
      "last_name": "de Oliveira",
      "display_name": "J. de Oliveira",
      "flat": 50,
      "sprint": 50,
      "endurance": 57,
      "resistance": 51,
      "recovery": 54,
      "race_iq": 55,
      "teamwork": 54
    },
    {
      "id": "bd2105ed-ef51-4b4c-9cc1-d7f1fb808282",
      "first_name": "Andrej",
      "last_name": "Jankovic",
      "display_name": "A. Jankovic",
      "flat": 74,
      "sprint": 74,
      "endurance": 82,
      "resistance": 80,
      "recovery": 78,
      "race_iq": 79,
      "teamwork": 82
    },
    {
      "id": "be607f3d-d44f-466d-a642-d83bab51ad54",
      "first_name": "Pedro",
      "last_name": "Martins",
      "display_name": "P. Martins",
      "flat": 54,
      "sprint": 51,
      "endurance": 58,
      "resistance": 55,
      "recovery": 56,
      "race_iq": 55,
      "teamwork": 58
    },
    {
      "id": "c62ed64a-b0f1-44e9-8f5b-cf1e4b789325",
      "first_name": "Gabriel",
      "last_name": "Silva",
      "display_name": "G. Silva",
      "flat": 74,
      "sprint": 71,
      "endurance": 75,
      "resistance": 74,
      "recovery": 75,
      "race_iq": 72,
      "teamwork": 73
    },
    {
      "id": "c6c84e8a-c91b-4b61-8e3a-ea63a5681a57",
      "first_name": "Francisco",
      "last_name": "Rocha",
      "display_name": "F. Rocha",
      "flat": 49,
      "sprint": 49,
      "endurance": 53,
      "resistance": 51,
      "recovery": 52,
      "race_iq": 54,
      "teamwork": 48
    },
    {
      "id": "ccc19703-729b-4233-9580-3d9c2381dc28",
      "first_name": "Ignacio",
      "last_name": "Araya",
      "display_name": "I. Araya",
      "flat": 50,
      "sprint": 47,
      "endurance": 53,
      "resistance": 51,
      "recovery": 54,
      "race_iq": 54,
      "teamwork": 52
    },
    {
      "id": "d4af45a7-51a5-4126-86c5-cc729a0b2697",
      "first_name": "Pedro",
      "last_name": "Pereira",
      "display_name": "P. Pereira",
      "flat": 64,
      "sprint": 65,
      "endurance": 71,
      "resistance": 73,
      "recovery": 73,
      "race_iq": 72,
      "teamwork": 71
    },
    {
      "id": "d5fbd806-bdc9-4539-b734-a410820d5b2f",
      "first_name": "Karlo",
      "last_name": "Mikulic",
      "display_name": "K. Mikulic",
      "flat": 82,
      "sprint": 78,
      "endurance": 78,
      "resistance": 80,
      "recovery": 79,
      "race_iq": 77,
      "teamwork": 75
    },
    {
      "id": "d89f68aa-0037-48c5-b9d8-8aad21f43172",
      "first_name": "Daniel",
      "last_name": "de Jesus",
      "display_name": "D. de Jesus",
      "flat": 56,
      "sprint": 54,
      "endurance": 54,
      "resistance": 53,
      "recovery": 54,
      "race_iq": 55,
      "teamwork": 53
    },
    {
      "id": "dacad8b2-e25a-436d-989a-cc0dc0c602e6",
      "first_name": "David",
      "last_name": "Babic",
      "display_name": "D. Babic",
      "flat": 71,
      "sprint": 72,
      "endurance": 79,
      "resistance": 75,
      "recovery": 73,
      "race_iq": 77,
      "teamwork": 78
    },
    {
      "id": "daf48781-a69f-4a4f-8315-be9077dfcd6b",
      "first_name": "Flamur",
      "last_name": "Elezi",
      "display_name": "F. Elezi",
      "flat": 62,
      "sprint": 63,
      "endurance": 67,
      "resistance": 67,
      "recovery": 61,
      "race_iq": 65,
      "teamwork": 67
    },
    {
      "id": "def329f4-90f6-4eea-b547-c60df0973459",
      "first_name": "Francisco",
      "last_name": "Fernandez",
      "display_name": "F. Fernandez",
      "flat": 48,
      "sprint": 46,
      "endurance": 54,
      "resistance": 53,
      "recovery": 55,
      "race_iq": 55,
      "teamwork": 54
    },
    {
      "id": "e1b0b5f2-cf94-4025-9580-3078a814f4c1",
      "first_name": "Lucas",
      "last_name": "Mendez",
      "display_name": "L. Mendez",
      "flat": 52,
      "sprint": 50,
      "endurance": 56,
      "resistance": 56,
      "recovery": 53,
      "race_iq": 53,
      "teamwork": 59
    },
    {
      "id": "e2366450-9e28-44fd-9b39-2000898cd906",
      "first_name": "Lucas",
      "last_name": "Bernard",
      "display_name": "L. Bernard",
      "flat": 68,
      "sprint": 71,
      "endurance": 74,
      "resistance": 77,
      "recovery": 67,
      "race_iq": 69,
      "teamwork": 68
    },
    {
      "id": "e308a71d-9ccf-4a38-9991-7ceb657c20de",
      "first_name": "Nikola",
      "last_name": "Ilic",
      "display_name": "N. Ilic",
      "flat": 82,
      "sprint": 78,
      "endurance": 82,
      "resistance": 81,
      "recovery": 78,
      "race_iq": 73,
      "teamwork": 77
    },
    {
      "id": "e5aa4ff6-f9e5-4686-a8b1-d55a89dd0c9d",
      "first_name": "Benicio",
      "last_name": "Herrera",
      "display_name": "B. Herrera",
      "flat": 55,
      "sprint": 52,
      "endurance": 54,
      "resistance": 54,
      "recovery": 54,
      "race_iq": 53,
      "teamwork": 51
    },
    {
      "id": "e6cdd986-11e7-4c43-91df-ad513dc61695",
      "first_name": "Rodrigue",
      "last_name": "Zoundi",
      "display_name": "R. Zoundi",
      "flat": 59,
      "sprint": 59,
      "endurance": 67,
      "resistance": 60,
      "recovery": 68,
      "race_iq": 60,
      "teamwork": 61
    },
    {
      "id": "ec3c53bf-cc7c-4bbe-9152-a0318d32683d",
      "first_name": "Felipe",
      "last_name": "Rocha",
      "display_name": "F. Rocha",
      "flat": 52,
      "sprint": 51,
      "endurance": 56,
      "resistance": 53,
      "recovery": 54,
      "race_iq": 56,
      "teamwork": 57
    },
    {
      "id": "f0eb3994-0c28-4498-84e4-14b9cc3a95b5",
      "first_name": "Pedro",
      "last_name": "Lima",
      "display_name": "P. Lima",
      "flat": 74,
      "sprint": 73,
      "endurance": 79,
      "resistance": 78,
      "recovery": 77,
      "race_iq": 77,
      "teamwork": 80
    },
    {
      "id": "f0f5ddc5-6d77-43e3-820c-9f9501c97692",
      "first_name": "Valentin",
      "last_name": "Garcia",
      "display_name": "V. Garcia",
      "flat": 56,
      "sprint": 59,
      "endurance": 53,
      "resistance": 51,
      "recovery": 50,
      "race_iq": 53,
      "teamwork": 50
    },
    {
      "id": "f6084e7d-7032-4837-87f2-7e07df32983c",
      "first_name": "Leonardo",
      "last_name": "dos Santos",
      "display_name": "L. dos Santos",
      "flat": 47,
      "sprint": 46,
      "endurance": 53,
      "resistance": 49,
      "recovery": 51,
      "race_iq": 53,
      "teamwork": 46
    }
  ],
  "stagePlans": [
    {
      "id": "9d1b6b94-226c-40e5-85f4-a62ab1cba05c",
      "club_id": null,
      "participating_club_id": null,
      "status": "draft",
      "metadata": {
        "default_race_captain_rider_id": "7dae4e01-fec9-43ac-94fa-e1ba1e3e1ffb"
      },
      "rider_roles_json": {
        "1e078c43-0316-4887-a1a2-096a42c29a67": "free_role",
        "58e785f3-e32c-4bdd-a429-2503ed71d04a": "free_role",
        "7408ecba-4726-4165-b382-0bfd8f444195": "free_role",
        "7dae4e01-fec9-43ac-94fa-e1ba1e3e1ffb": "team_leader_gc",
        "9edd7492-3498-4d98-907e-78b35e42e28f": "sprinter",
        "daf48781-a69f-4a4f-8315-be9077dfcd6b": "free_role"
      }
    },
    {
      "id": "b79f44d3-f309-441c-b39d-122725ac1496",
      "club_id": null,
      "participating_club_id": null,
      "status": "draft",
      "metadata": {
        "default_race_captain_rider_id": "5a530ba9-435a-4dcc-991f-c00e1a048f4f"
      },
      "rider_roles_json": {
        "1a29ac57-1fb8-4f7c-a24e-3f9e76b3ad51": "free_role",
        "35f9dedb-9eb6-4d7a-ab28-7289050843ca": "free_role",
        "5a530ba9-435a-4dcc-991f-c00e1a048f4f": "team_leader_gc",
        "8218bf2c-b2c9-4873-8d6e-006f0a71621d": "sprinter",
        "9834aadc-353b-44a2-9cc2-00d33aef5cb5": "free_role",
        "acbbc56e-ea56-4d45-9e0e-5025ca73c2e5": "free_role"
      }
    },
    {
      "id": "c9cb926b-181c-47e5-b00b-e86a64d06ca6",
      "club_id": null,
      "participating_club_id": null,
      "status": "draft",
      "metadata": {
        "default_race_captain_rider_id": null
      },
      "rider_roles_json": {
        "23ea7c92-f1fb-484a-bf1f-f0492fe711b6": "free_role",
        "272a5246-ef80-4d6b-9094-16b0e8520641": "helper_domestique",
        "2b490bbb-1024-4ca7-8df7-5602e9c6e406": "free_role",
        "2e132fdc-c83d-4e7c-a195-fed9eec866ec": "sprinter",
        "8bccbff9-6c15-4332-95f4-ddd50f902c78": "team_leader_gc",
        "e6cdd986-11e7-4c43-91df-ad513dc61695": "helper_domestique"
      }
    },
    {
      "id": "d8a26d07-93cb-45b8-badc-6015e3ac8a75",
      "club_id": null,
      "participating_club_id": null,
      "status": "draft",
      "metadata": {
        "default_race_captain_rider_id": "6a006297-fa3b-4162-86fa-dff5102d8819"
      },
      "rider_roles_json": {
        "29250b22-8d38-413b-9af3-408399383667": "free_role",
        "6a006297-fa3b-4162-86fa-dff5102d8819": "team_leader_gc",
        "7ba24d04-2c6f-4c23-8c5a-67e1bae517cc": "free_role",
        "8b104bc2-b004-4cb4-8d49-3ed3245c3d05": "free_role",
        "bd2105ed-ef51-4b4c-9cc1-d7f1fb808282": "breakaway_rider",
        "e308a71d-9ccf-4a38-9991-7ceb657c20de": "breakaway_rider"
      }
    },
    {
      "id": "dbb7f403-aeb4-4149-a5a1-1b3b4f5c65ae",
      "club_id": null,
      "participating_club_id": null,
      "status": "draft",
      "metadata": {
        "default_race_captain_rider_id": "6cdb0ed5-d3eb-40a4-86ad-93dc5352d9cc"
      },
      "rider_roles_json": {
        "48b5f31c-a594-4c5d-8c01-b3ef5b9edb8b": "sprinter",
        "568caa21-299e-428b-a06f-fe08d43ed15f": "lead_out_rider",
        "6cdb0ed5-d3eb-40a4-86ad-93dc5352d9cc": "team_leader_gc",
        "a7839ca2-d6a4-4223-aef4-30f6fc1384ff": "helper_domestique",
        "d5fbd806-bdc9-4539-b734-a410820d5b2f": "free_role",
        "dacad8b2-e25a-436d-989a-cc0dc0c602e6": "free_role"
      }
    }
  ],
  "profilePoints": [
    {
      "km": 0,
      "elevation_m": 12,
      "elevation": 12
    },
    {
      "km": 16,
      "elevation_m": 8,
      "elevation": 8
    },
    {
      "km": 28,
      "elevation_m": 10,
      "elevation": 10
    },
    {
      "km": 44,
      "elevation_m": 22,
      "elevation": 22
    },
    {
      "km": 62,
      "elevation_m": 30,
      "elevation": 30
    },
    {
      "km": 82,
      "elevation_m": 18,
      "elevation": 18
    },
    {
      "km": 102,
      "elevation_m": 12,
      "elevation": 12
    },
    {
      "km": 124,
      "elevation_m": 8,
      "elevation": 8
    },
    {
      "km": 142,
      "elevation_m": 5,
      "elevation": 5
    }
  ]
} as const

const mergedRioStage1Riders =
  rioStage1SourceRowsBase.riders.map(
    (rider) => {
      const performance =
        rioStage1RiderPerformanceAttributes[
          rider.id
        ]

      if (!performance) {
        throw new Error(
          `Missing Rio Stage 1 performance attributes for rider ${rider.id}.`,
        )
      }

      return {
        ...rider,
        ...performance,
      }
    },
  )

export const rioStage1SourceRows:
  CreateStageInputFromSourceRowsParams = {
    ...rioStage1SourceRowsBase,
    riders:
      mergedRioStage1Riders,
  }
