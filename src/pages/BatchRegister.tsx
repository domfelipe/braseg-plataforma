import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, CheckCircle, XCircle, SkipForward } from "lucide-react";

const PROFESSIONALS = [
  { full_name: "Ana Carolina Fernandes de Maria", email: "anacarolinafernandess98@hotmail.com", phone: "(14) 98215-8449" },
  { full_name: "Ana Laura Joanini", email: "analaurajoanini@icloud.com", phone: "(14) 99788-3797" },
  { full_name: "Bárbara de Almeida Martins", email: "barbaara.martins@hotmail.com", phone: "(14) 99880-3649" },
  { full_name: "Camila Furlani Pagan", email: "cah.pagan@hotmail.com", phone: "(14) 99671-5065" },
  { full_name: "Danilo de Oliveira Rodrigues", email: "danilo.deorodrigues@gmail.com", phone: "(45) 98412-9658" },
  { full_name: "Fabiano Ceschini", email: "sicbraga@outlook.com", phone: "(47) 99271-2583" },
  { full_name: "Fernando Briganti Ribeiro", email: "brigantiribeirodr@gmail.com", phone: "(43) 99686-0678" },
  { full_name: "Filipe Pacheco Fernandes", email: "filipepacheco607@gmail.com", phone: "(18) 98110-5770" },
  { full_name: "Frank Emerson Sussumo Sato", email: "otasknarf@hotmail.com", phone: "(14) 99811-6161" },
  { full_name: "Giuliano de Lima Capobianco", email: "giulianodelimacapobianco@gmail.com", phone: "(14) 99670-1761" },
  { full_name: "Guilherme Fernandes da Silva", email: "guilhermefernandes.dr43@gmail.com", phone: "(14) 99716-6241" },
  { full_name: "Guilherme Romano", email: "guiromanoo@hotmail.com", phone: "(14) 99728-8101" },
  { full_name: "Joao Luiz Marangoni", email: "fortecorporativa@gmail.com", phone: "(14) 98131-7662" },
  { full_name: "João Mateus Silva Martins", email: "joaomateusbri@gmail.com", phone: "(16) 98806-8763" },
  { full_name: "Joao Paulo Zanardini de Lara", email: "joaopaulolara95@gmail.com", phone: "(41) 8875-9024" },
  { full_name: "Joao Pedro Granado Leme Nunes", email: "jp_granado@hotmail.com", phone: "(18) 99802-6003" },
  { full_name: "Karen Valedorio Zola", email: "dra.karenvzola@gmail.com", phone: "(14) 98810-8562" },
  { full_name: "Leonardo Furlanetti", email: "leonardo_furlanetti@outlook.com", phone: "(14) 99656-2107" },
  { full_name: "Letícia Venturini Ticianeli", email: "leticiaventurini17@gmail.com", phone: "(14) 98110-6040" },
  { full_name: "Luan Carlos Pereira de Azevedo", email: "luan.medcpazevedo@gmail.com", phone: "(14) 99897-0401" },
  { full_name: "Marcelo Peruzzi Filho", email: "peruzzi.marcelo@gmail.com", phone: "(18) 99704-4134" },
  { full_name: "Mariana Mantovani Petenuci", email: "mmantovanipetenuci@gmail.com", phone: "(14) 99762-8891" },
  { full_name: "Mariana Sia Santos", email: "marianasiasantos@gmail.com", phone: "(14) 99705-8187" },
  { full_name: "Monica Gigliotti", email: "monica_gigliotti@hotmail.com", phone: "(14) 99748-1165" },
  { full_name: "Paulo Roberto Arduini Júnior", email: "pauloarduinij@gmail.com", phone: "(34) 99985-4810" },
  { full_name: "Pedro Henrique Paulucci Marino", email: "marinophp@gmail.com", phone: "(14) 98206-4125" },
  { full_name: "Phabricia Estrela Mendonca", email: "estrelapha@gmail.com", phone: "(62) 98131-0529" },
  { full_name: "Plinio Mestrinel Junior", email: "mestrineljr@hotmail.com", phone: "(14) 99102-3963" },
  { full_name: "Sâmya Carinhato", email: "samyacarinhato@hotmail.com", phone: "(14) 99197-7074" },
  { full_name: "Sofia Olbrich dos Santos", email: "sofiaolbrich@outlook.com", phone: "(14) 99767-9797" },
  { full_name: "Stella Danti Pafetti", email: "stellapafetti912@gmail.com", phone: "(19) 99944-2754" },
  { full_name: "Thaís Raulino Dias", email: "thaisraulino4@gmail.com", phone: "(14) 98809-2002" },
  { full_name: "Thaiz Geovana Bezerra", email: "thaiz94geovanab@gmail.com", phone: "(18) 99606-2654" },
  { full_name: "Vitoria Gianini Brito Franco", email: "vitoriagianinifranco@gmail.com", phone: "(14) 99841-8965" },
  { full_name: "Ana Maria Daun Cacao Pereira", email: "ana-maria.pereira@unesp.br", phone: "(14) 99770-1225" },
  { full_name: "Daniela Delgado Dias", email: "daniela.diasbf@gmail.com", phone: "(14) 98194-4197" },
  { full_name: "Eduardo Augusto Andrade Vieira", email: "eduardoaavieira@gmail.com", phone: "(19) 99694-2979" },
  { full_name: "Gabriela Hikari Tukiyama", email: "gabitukiyama@gmail.com", phone: "(14) 99879-6891" },
  { full_name: "Gustavo Braz Moreira Schettino", email: "gustavo.schettino@unesp.br", phone: "(24) 99249-3599" },
  { full_name: "Helena Telles Furtado dos Santos", email: "hetfds@hotmail.com", phone: "(16) 99299-5318" },
  { full_name: "Joao Vitor de Avila Soares", email: "jvasoares1999@gmail.com", phone: "(18) 99696-5556" },
  { full_name: "Keturi Gabriela Alves da Silva", email: "silvaketuri@gmail.com", phone: "(14) 99613-3192" },
  { full_name: "Laisa Marina Miranda Tavares Reis", email: "275215fk@gmail.com", phone: "(18) 99732-1914" },
  { full_name: "Letícia Nastulevitie de Oliveira", email: "leticia.nastulevitie@gmail.com", phone: "(14) 99195-2864" },
  { full_name: "Letícia Pires de Campos", email: "leticiapiresdcampos@gmail.com", phone: "(14) 99674-2020" },
  { full_name: "Matheus Dellacrode Giovanazzi", email: "mdgiovanazzi@gmail.com", phone: "(14) 99696-2846" },
  { full_name: "Samantha Ellen da Silva Fonseca", email: "samanthafonsec@gmail.com", phone: "(11) 97371-0774" },
  { full_name: "Sarah Geia Yaktine", email: "sarah.yaktine@gmail.com", phone: "(16) 98158-3859" },
  { full_name: "Thamyres Siqueira Cruz", email: "thamyres.cruz@unesp.br", phone: "(11) 98218-9759" },
  { full_name: "Vitor Vernini Padovani", email: "vitorvp17@gmail.com", phone: "(14) 99736-3929" },
  { full_name: "Vitoria Nogueira Ribeiro", email: "vitoria.n.ribeiro@unesp.br", phone: "(11) 99764-1910" },
  { full_name: "Dhyovana Filippini Salina", email: "dhyovanafsalina@gmail.com", phone: "(14) 99811-1715" },
  { full_name: "Igor Alberto Andrade Vieira", email: "igor2013aav@gmail.com", phone: "(19) 99701-1017" },
  { full_name: "Leonardo Lucatto Garro", email: "leonardo.lucatto8@gmail.com", phone: "(14) 98225-8564" },
  { full_name: "Victor Henrique Murback dos Reis", email: "plantaovhmr@gmail.com", phone: "(12) 98155-5787" },
  { full_name: "Gabriel Ricardo Correa Turco", email: "turco.gabriel2@gmail.com", phone: "(11) 99794-3774" },
  { full_name: "Isabella Manhoni Lima", email: "isabellamanhoni@gmail.com", phone: "(14) 99713-1210" },
  { full_name: "Jadson Antonio Fattori", email: "jadson_fattori@hotmail.com", phone: "(14) 99624-1196" },
  { full_name: "Juliana Pantoja da Silva", email: "juh_pantoja@yahoo.com.br", phone: "(11) 98665-9629" },
  { full_name: "Mariana Pacchioni", email: "dra.pacchioni@gmail.com", phone: "(19) 99726-7037" },
  { full_name: "Morie Leticia Dalera de Carli", email: "moriedalera@gmail.com", phone: "(13) 99786-6203" },
  { full_name: "Paula Georgia Dias Pereira", email: "paula-georgia@hotmail.com", phone: "(14) 99192-6845" },
  { full_name: "Victor El Chihimi Bernardi", email: "victorelbe@gmail.com", phone: "(11) 99648-0658" },
  { full_name: "Ana Luiza de Freitas Silva", email: "ana.f.silva@unesp.br", phone: "(12) 98844-3202" },
  { full_name: "Anelyse Liberato da Silva", email: "anelyseliberato@gmail.com", phone: "(16) 99248-2601" },
  { full_name: "Anmony Borralho de Figueiredo", email: "anmonyborralho@gmail.com", phone: "(65) 99215-1159" },
  { full_name: "Beatriz Barea Carvalho", email: "biabarea.bbc@gmail.com", phone: "(14) 99749-8928" },
  { full_name: "Beatriz Cristina Vieira Teixeira", email: "beatrizcristinavt@gmail.com", phone: "(14) 99196-2989" },
  { full_name: "Bruno Barros Bueno", email: "brunubarros@hotmail.com", phone: "(14) 99185-7676" },
  { full_name: "Eduarda Costa Dezan", email: "eduardacosta1706@hotmail.com", phone: "(14) 99799-6026" },
  { full_name: "Fabíola Vieira Borges", email: "favborges@gmail.com", phone: "(14) 99689-2652" },
  { full_name: "Gabriel Bilar Aguilar", email: "g.b.aguilar28@gmail.com", phone: "(11) 96846-0103" },
  { full_name: "Gabriel Braga Villa", email: "gabrielbragavilla@gmail.com", phone: "(11) 96324-4621" },
  { full_name: "Gabriella Garcia Ribeiro Camargo", email: "gabigarcia59@gmail.com", phone: "(14) 99121-0107" },
  { full_name: "Matheus Henrique Mangini Bocchi", email: "matheus-bocchi@hotmail.com", phone: "(14) 99667-6766" },
  { full_name: "Vinicius Barrionuevo Garcia Gullo", email: "promedspsaude@gmail.com", phone: "(18) 98122-5097" },
  { full_name: "Jenny Garcia Meza Kohler", email: "jennygarciakohler@yahoo.com.br", phone: "(14) 99897-6529" },
  { full_name: "Julio Cesar Cipriano Basilio", email: "juliocbasilio2000@gmail.com", phone: "(14) 99105-5530" },
  { full_name: "Larissa Flavia Gomes Ribeiro", email: "larissa.fgribeiroo@gmail.com", phone: "(14) 99709-6180" },
  { full_name: "Lukas Fernando de Oliveira Silva", email: "lukas108@hotmail.com", phone: "(19) 99643-9192" },
  { full_name: "Murilo Cesar Cachoeira", email: "muriloccachoeira@gmail.com", phone: "(16) 99706-1509" },
  { full_name: "Isabela Lyria de Alencar Bassanezi", email: "isabassanezi@hotmail.com", phone: "(18) 99781-1060" },
  { full_name: "Livia Martin Cardozo", email: "121513fk@gmail.com", phone: "(14) 99145-9595" },
  { full_name: "Mitz Carla Ramalho Farias Chamma", email: "mitzchamma@gmail.com", phone: "(14) 99773-7839" },
  { full_name: "Thales Cabral Benini Felisberto", email: "thalescbf@icloud.com", phone: "(14) 99822-8066" },
  { full_name: "Amanda Paschoal Piccini", email: "amandappiccini@outlook.com", phone: "(14) 99670-2056" },
  { full_name: "Ana Laura Maruschi", email: "maruschianalaura@gmail.com", phone: "(14) 99701-7576" },
  { full_name: "Andre Luis Moura Balbino Freitas", email: "andreluismourab@hotmail.com", phone: "(14) 99723-3877" },
  { full_name: "Arthur Luiz de Macedo Fressatti", email: "arthur.fressatti@gmail.com", phone: "(14) 99607-7862" },
  { full_name: "Bruno Deziderio Mendonca", email: "brunoo.mendonca74@gmail.com", phone: "(14) 99485-8668" },
  { full_name: "Camila Fiabani Cordeiro", email: "camila_fc1@hotmail.com", phone: "(18) 98154-1321" },
  { full_name: "Carlos Eduardo Cassere Rosa", email: "dreduardocassere@gmail.com", phone: "(14) 99801-2923" },
  { full_name: "César Augusto dos Santos Andrade", email: "cesaraugusto.and970@gmail.com", phone: "(35) 99954-0215" },
  { full_name: "Cristiano Martins Beserra", email: "cristiano.martins.beserra@gmail.com", phone: "(11) 98471-2301" },
  { full_name: "Daniel Alves de Oliveira", email: "danielalves.oliveira077@gmail.com", phone: "(18) 99623-1197" },
  { full_name: "Daniel Henrique Nunes Mulotto", email: "daniel@mulotto.com.br", phone: "(14) 99713-3535" },
  { full_name: "Diego Henrique de Oliveira", email: "8diegooliveira@gmail.com", phone: "(14) 98183-6275" },
  { full_name: "Fabio Henrique Villa Pinto", email: "fabvill54@gmail.com", phone: "(16) 98858-3461" },
  { full_name: "Fernando Morelli Marangoni", email: "fernandomorellimarangoni@gmail.com", phone: "(16) 98153-2755" },
  { full_name: "Gabriela Gerios", email: "gabrielagerios@gmail.com", phone: "(11) 97297-3934" },
  { full_name: "Gabriela Moreira Leandro", email: "gabileandro@hotmail.com", phone: "(41) 99815-6192" },
  { full_name: "Gabriela Pinheiro dos Santos", email: "gabrielapinheiro.pj@gmail.com", phone: "(19) 99561-8817" },
  { full_name: "Giovanna Beatrice de Sousa", email: "giovannabeatricedesousa@gmail.com", phone: "(19) 99676-0462" },
  { full_name: "Giuliana Elena Saragiotto", email: "saragiottogiuliana@gmail.com", phone: "(31) 99822-8860" },
  { full_name: "Henrique Cadamuro Mussio", email: "henriquecmussio@gmail.com", phone: "(17) 98130-2483" },
  { full_name: "Henrique Maitto Benini", email: "henrique_benini17@hotmail.com", phone: "(16) 98123-6799" },
  { full_name: "Jovyne Karollyna Kaleski Vicente da Silva", email: "jovyne.kaleski@gmail.com", phone: "(13) 99697-6723" },
  { full_name: "Lara Makdesi Pereira Ribeiro", email: "lara_makdesi@hotmail.com", phone: "(44) 99849-7067" },
  { full_name: "Leticia Kallyne Rodrigues da Silva", email: "leticia.krodriguessilva@gmail.com", phone: "(82) 99673-6952" },
  { full_name: "Leticia Oliveira Castelao", email: "leticiacastelao2@hotmail.com", phone: "(18) 99770-7679" },
  { full_name: "Lucas Andrade Toledo", email: "lucas.toledo@unesp.br", phone: "(71) 99722-6530" },
  { full_name: "Lucas Augusto Delgado Boteon", email: "lucas.boteon@gmail.com", phone: "(17) 99164-5038" },
  { full_name: "Lucas Hideo Yamanaka", email: "lucashideo123@hotmail.com", phone: "(15) 99638-1419" },
  { full_name: "Lucas Scrocaro Gracioli", email: "graciolilucas@gmail.com", phone: "(17) 98109-2451" },
  { full_name: "Mariana Bertucco Bazan", email: "marianabbazan@gmail.com", phone: "(18) 99769-0777" },
  { full_name: "Natalia Nozela Ricci Mansur", email: "natalia-ricci1@hotmail.com", phone: "(16) 99290-7434" },
  { full_name: "Olívia da Costa Golfieri", email: "oliviadacgolfieri@gmail.com", phone: "(11) 98260-5476" },
  { full_name: "Oswaldo Heber Avila Lyra", email: "oswaldo_heber@hotmail.com", phone: "(17) 99678-0080" },
  { full_name: "Otavio Guimaraes Gomes e Silva", email: "otavio.guimaraes96@hotmail.com", phone: "(11) 99790-9669" },
  { full_name: "Paulo Henrique Lazarini Filho", email: "paulo.lazarini101@gmail.com", phone: "(14) 99831-2771" },
  { full_name: "Pedro Augusto de Oliveira Azevedo", email: "pedroaoazevedo@gmail.com", phone: "(24) 98145-5761" },
  { full_name: "Pedro de Alcantara Milhomens Neto", email: "pedroamneto10@gmail.com", phone: "(11) 99904-0162" },
  { full_name: "Pedro Rafael Costa", email: "pedrorafaelcosta@hotmail.com", phone: "(16) 99717-4809" },
  { full_name: "Renan da Silva Neves", email: "renan.neves@unesp.br", phone: "(11) 97170-0194" },
  { full_name: "Roberta Cardoso Pinheiro", email: "roberta.pinheiro@unesp.br", phone: "(11) 98678-9937" },
  { full_name: "Rodrigo Thomazi Rodrigues", email: "rodrigothomazi_91@hotmail.com", phone: "(11) 95148-6688" },
  { full_name: "Amanda Priscila Pena Crepaldi", email: "amanda.crepaldi81@gmail.com", phone: "(14) 99820-9539" },
  { full_name: "Amanda Roberta Labarce", email: "arlabarce@gmail.com", phone: "(14) 99181-7078" },
  { full_name: "Ana Clara Correa Langhi", email: "ana.claralanghi@hotmail.com", phone: "(18) 99697-0706" },
  { full_name: "Anna Liz Torres Bergonce", email: "annaliztorres@hotmail.com", phone: "(16) 99774-6131" },
  { full_name: "Antonio Torino Garcia", email: "antonio13.garcia@hotmail.com", phone: "(14) 99785-5342" },
  { full_name: "Athillio Aurelio Rodrigues Bettini", email: "athilliobettini@hotmail.com", phone: "(43) 99671-1212" },
  { full_name: "Bruna Fernanda Mischieri", email: "brunaf.mischieri@gmail.com", phone: "(14) 99617-5416" },
  { full_name: "Bruno Longhi de Sampaio Goes", email: "blsgservicosmedicos@gmail.com", phone: "(14) 93618-0296" },
  { full_name: "Caio de Sa Santos", email: "caiodesa.doc@gmail.com", phone: "(16) 99613-1120" },
  { full_name: "Daniel Domarco Rosella", email: "daniel.rosella@gmail.com", phone: "(14) 99712-0299" },
  { full_name: "Fabio Henrique Floro da Silva", email: "fabiofloro@yahoo.com.br", phone: "(14) 99826-2835" },
  { full_name: "Felipe Rosa", email: "ofeliperosa@outlook.com", phone: "(62) 99532-9592" },
  { full_name: "Gabriel Henrique de Lima Saez", email: "gabrielhenriquesaez@hotmail.com", phone: "(16) 99731-8421" },
  { full_name: "Gabriela Fernanda Oliveira Pereira", email: "gabifernandaoliper@gmail.com", phone: "(18) 99623-6708" },
  { full_name: "Gabriela Herrera Goes", email: "gabiherreragoes@gmail.com", phone: "(14) 99860-2830" },
  { full_name: "Gabriella Melo Rodrigues", email: "gabriellaferreh@hotmail.com", phone: "(14) 99103-3731" },
  { full_name: "Gustavo Americo Alves", email: "gustavo.americoo@gmail.com", phone: "(34) 98878-5636" },
  { full_name: "Gustavo Pina Vieira", email: "pinafarmaceutico@gmail.com", phone: "(17) 99613-0878" },
  { full_name: "Heloisa Dallabona", email: "helo_dallabona@icloud.com", phone: "(47) 99943-1288" },
  { full_name: "Higor Victor Alexandre de Deus", email: "dr.higorvictor@gmail.com", phone: "(94) 99229-0758" },
  { full_name: "Isabella Forte Alves", email: "isabellaforte1@gmail.com", phone: "(14) 99778-2852" },
  { full_name: "Jonathan Hanan Bosso", email: "jonathanhanan@gmail.com", phone: "(14) 99135-8052" },
  { full_name: "Katina Meneghetti de Souza", email: "katinameneghetti@gmail.com", phone: "(14) 99793-3860" },
  { full_name: "Larissa Fonseca da Silva", email: "larissa.silvalfds@gmail.com", phone: "(14) 98128-4534" },
  { full_name: "Leonardo Faria Silva", email: "faria.leonardo1996@gmail.com", phone: "(35) 98721-4037" },
  { full_name: "Leonardo Garcia Baldim", email: "leobaldim21@gmail.com", phone: "(18) 99117-1623" },
  { full_name: "Luana Stallmam Bessani", email: "lusbessani@hotmail.com", phone: "(45) 98431-9059" },
  { full_name: "Luise Clara Vincenzzi Guandalini", email: "luise.vincenzzi.guandalini@gmail.com", phone: "(16) 99772-5100" },
  { full_name: "Marcela Chiriano", email: "dra.mchiriano@gmail.com", phone: "(14) 99889-9863" },
  { full_name: "Maria Eduarda Bochembuzio Ribeiro", email: "7dudamed@gmail.com", phone: "(14) 99819-1757" },
  { full_name: "Maria Elisa Pereira Godinho", email: "m.p.godinho@hotmail.com", phone: "(18) 99783-7979" },
  { full_name: "Mariana Estella Conti Nicoletti", email: "mariana.c.nicoletti@gmail.com", phone: "(16) 99642-6707" },
  { full_name: "Mariane Fantinelli Venarusso", email: "marianefantinelliv@hotmail.com", phone: "(14) 99861-6383" },
  { full_name: "Marina Ayumi Simão Arikawa", email: "marikawa99@gmail.com", phone: "(18) 99728-4496" },
  { full_name: "Matheus Peretti Vieira de Almeida", email: "medmath17@gmail.com", phone: "(14) 99788-8333" },
  { full_name: "Nicoly Barros de Oliveira", email: "dra.nicolybarros@gmail.com", phone: "(88) 99725-2269" },
  { full_name: "Priscila Witt Said", email: "priscila.ws@hotmail.com", phone: "(14) 99636-2204" },
  { full_name: "Sairus Hideki Richieri Kikutake", email: "japa-shrk@hotmail.com", phone: "(14) 99803-8269" },
  { full_name: "Thalles Porfirio Dutra", email: "thallesporfiriodutra@gmail.com", phone: "(14) 99781-1574" },
  { full_name: "Tiago Pascolat Castro", email: "castrotiago@hotmail.com", phone: "(14) 98217-3353" },
  { full_name: "Victor Buscariolo Zanutto", email: "victorbzservicosmedicos@gmail.com", phone: "(14) 99759-4822" },
  { full_name: "Victor Torelli Martini", email: "dr.victor.martini@gmail.com", phone: "(14) 99664-6603" },
  { full_name: "Vitor Berchol Garbelini", email: "vitorgarbelini@hotmail.com", phone: "(14) 99650-3723" },
  { full_name: "Viviam da Silva Gomes", email: "viviamsgomes@gmail.com", phone: "(14) 99183-4326" },
  { full_name: "Willian Ortega Scardovelli", email: "willianscardovelli1@gmail.com", phone: "(18) 99783-7350" },
];

const BATCH_SIZE = 10;

export default function BatchRegister() {
  const { isMaster } = useAuth();
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<{ email: string; status: string; error?: string }[]>([]);
  const [progress, setProgress] = useState(0);

  if (!isMaster) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-destructive font-semibold">Acesso restrito a administradores.</p>
      </div>
    );
  }

  const handleStart = async () => {
    setRunning(true);
    setResults([]);
    setProgress(0);

    const allResults: { email: string; status: string; error?: string }[] = [];

    for (let i = 0; i < PROFESSIONALS.length; i += BATCH_SIZE) {
      const batch = PROFESSIONALS.slice(i, i + BATCH_SIZE).map((p) => ({
        email: p.email,
        password: "Mudar@123",
        full_name: p.full_name,
        phone: p.phone,
        role: "profissional",
      }));

      try {
        const { data, error } = await supabase.functions.invoke("manage-users", {
          body: { action: "batch_create_users", users: batch },
        });

        if (error) {
          batch.forEach((u) => allResults.push({ email: u.email, status: "error", error: error.message }));
        } else if (data?.results) {
          allResults.push(...data.results);
        }
      } catch (err: any) {
        batch.forEach((u) => allResults.push({ email: u.email, status: "error", error: err.message }));
      }

      setResults([...allResults]);
      setProgress(Math.min(i + BATCH_SIZE, PROFESSIONALS.length));
    }

    setRunning(false);
  };

  const created = results.filter((r) => r.status === "created").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const errors = results.filter((r) => r.status === "error").length;

  return (
    <div className="min-h-screen bg-background p-6 max-w-4xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Cadastro em Lote de Profissionais</CardTitle>
          <p className="text-sm text-muted-foreground">
            Total: {PROFESSIONALS.length} profissionais únicos · Senha padrão: Mudar@123 · Role: profissional
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Button onClick={handleStart} disabled={running} size="lg">
              {running ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processando... ({progress}/{PROFESSIONALS.length})
                </>
              ) : (
                "Iniciar Cadastro"
              )}
            </Button>

            {results.length > 0 && (
              <div className="flex gap-2">
                <Badge variant="default" className="bg-emerald-600">{created} criados</Badge>
                <Badge variant="secondary">{skipped} já existem</Badge>
                {errors > 0 && <Badge variant="destructive">{errors} erros</Badge>}
              </div>
            )}
          </div>

          {running && (
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full transition-all"
                style={{ width: `${(progress / PROFESSIONALS.length) * 100}%` }}
              />
            </div>
          )}

          {results.length > 0 && (
            <ScrollArea className="h-[500px] border rounded-lg">
              <div className="p-3 space-y-1">
                {results.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 py-1 px-2 text-sm rounded hover:bg-muted/50">
                    {r.status === "created" && <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />}
                    {r.status === "skipped" && <SkipForward className="h-4 w-4 text-muted-foreground shrink-0" />}
                    {r.status === "error" && <XCircle className="h-4 w-4 text-destructive shrink-0" />}
                    <span className="font-mono text-xs">{r.email}</span>
                    {r.error && <span className="text-xs text-muted-foreground ml-auto">{r.error}</span>}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
